#!/usr/bin/env python3
"""Dependency-free disassembler and pseudo-decompiler for GameMaker VM bytecode
version 15+ (tested on 17, DELTARUNE chapter 1 data.win).

Instruction encoding, data/instance/variable types and extended (0xFF) opcodes
follow UndertaleModTool / Underanalyzer (used as a format reference only).

Usage:
  python -I tools/gmdis.py <data.win> dump-all <outdir>
  python -I tools/gmdis.py <data.win> show <entry-name-or-regex> [--asm-only|--gml-only]
  python -I tools/gmdis.py <data.win> check

dump-all writes <outdir>/<entry>.gml (pseudo-GML), <outdir>/asm/<entry>.asm,
INDEX.tsv (entry, bytes, locals, args, object, event, parent), ASSET_PARAMS.tsv
(which call arguments get asset annotations) and SELFCHECK.txt; it exits 1 if a
mandatory check fails.

Reading the output:
  - Labels are L<n>, n = word offset inside the code blob (same in .gml and .asm;
    child functions use their parent's numbering). The asm "depth" column is the
    stack height (entries) from dataflow; "-" means unreachable.
  - Control flow is structured into if/else, while, do/until, repeat, switch and
    with only by semantics-preserving rewrites; anything else stays as
    "if (c) goto Lx;" / "goto Lx;" with labels.
  - Self variables are bare; other./global./obj_x./instNNN. prefixes are explicit.
  - Integer literals in asset contexts carry /*name*/; several plausible kinds
    are listed as /*spr:a|obj:b*/. Untyped literals are never guessed.
  - "// [raw] ..." marks an instruction the simulator could not place, and
    "// WARNING: ..." marks a stack inconsistency; neither occurs in DELTARUNE
    chapter 1 (see SELFCHECK.txt).
  - A GlobalScript's nested function bodies are rendered in their own child
    entry files (gml_Script_*), and referenced from the parent by a comment.
  - asm "dup.T n swap=m" is dup-swap mode: the top n units of type T move below
    the m units under them (units = size of T).
  - "// unreachable: ..." marks statements the compiler emitted after a
    break/return (dead code that is in the bytecode).
  - Compound assignments are printed as "a = a + b" unless the lvalue's instance
    or index has a call in it; then "a += b", because the bytecode evaluates it once.
"""
import argparse
import os
import re
import struct
import sys

# ---------------------------------------------------------------- tables

OPS = {
    0x07: "conv", 0x08: "mul", 0x09: "div", 0x0A: "rem", 0x0B: "mod", 0x0C: "add",
    0x0D: "sub", 0x0E: "and", 0x0F: "or", 0x10: "xor", 0x11: "neg", 0x12: "not",
    0x13: "shl", 0x14: "shr", 0x15: "cmp", 0x45: "pop", 0x86: "dup", 0x9C: "ret",
    0x9D: "exit", 0x9E: "popz", 0xB6: "b", 0xB7: "bt", 0xB8: "bf", 0xBA: "pushenv",
    0xBB: "popenv", 0xC0: "push", 0xC1: "pushloc", 0xC2: "pushglb", 0xC3: "pushbltn",
    0x84: "pushi", 0xD9: "call", 0x99: "callv", 0xFF: "break",
}
SINGLE = {0x11, 0x12, 0x86, 0x9C, 0x9D, 0x9E, 0x99}
DOUBLE = {0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10, 0x13, 0x14}
GOTO = {0xB6, 0xB7, 0xB8, 0xBA, 0xBB}
PUSH = {0xC0, 0xC1, 0xC2, 0xC3, 0x84}

EXT = {-1: "chkindex", -2: "pushaf", -3: "popaf", -4: "pushac", -5: "setowner",
       -6: "isstaticok", -7: "setstatic", -8: "savearef", -9: "restorearef",
       -10: "isnullish", -11: "pushref"}

# data types: (mnemonic, stack size in bytes)
T_DOUBLE, T_FLOAT, T_INT, T_LONG, T_BOOL, T_VAR, T_STR, T_INST, T_DEL, T_UNDEF, T_UINT = range(11)
T_SHORT = 0x0F
TYPE_CH = {0: "d", 1: "f", 2: "i", 3: "l", 4: "b", 5: "v", 6: "s", 7: "inst", 8: "del",
           9: "undef", 10: "ui", 15: "e"}
TYPE_SIZE = {0: 8, 1: 4, 2: 4, 3: 8, 4: 4, 5: 16, 6: 4, 7: 16, 8: 16, 9: 16, 10: 4, 15: 4}

CMP = {1: "<", 2: "<=", 3: "==", 4: "!=", 5: ">=", 6: ">"}
CMP_NAME = {1: "LT", 2: "LTE", 3: "EQ", 4: "NEQ", 5: "GTE", 6: "GT"}
CMP_NEG = {1: 5, 2: 6, 3: 4, 4: 3, 5: 1, 6: 2}

INST = {0: "undefined", -1: "self", -2: "other", -3: "all", -4: "noone", -5: "global",
        -6: "builtin", -7: "local", -9: "stacktop", -15: "arg", -16: "static"}
VT_ARRAY, VT_STACKTOP, VT_NORMAL, VT_INSTANCE, VT_MPUSH, VT_MPUSHPOP = 0x00, 0x80, 0xA0, 0xE0, 0x10, 0x90
VT_NAME = {0x00: "array", 0x80: "stacktop", 0xA0: "", 0xE0: "instance",
           0x10: "arraypushaf", 0x90: "arraypopaf"}

BINOP = {0x08: "*", 0x09: "/", 0x0A: "div", 0x0B: "%", 0x0C: "+", 0x0D: "-", 0x0E: "&",
         0x0F: "|", 0x10: "^", 0x13: "<<", 0x14: ">>"}
# precedence for parenthesisation (higher binds tighter)
PREC = {"||": 1, "&&": 2, "^^": 2, "|": 3, "^": 4, "&": 5, "==": 6, "!=": 6, "<": 7, "<=": 7,
        ">": 7, ">=": 7, "<<": 8, ">>": 8, "+": 9, "-": 9, "*": 10, "/": 10, "div": 10, "%": 10}

EVENTS = ["Create", "Destroy", "Alarm", "Step", "Collision", "Keyboard", "Mouse", "Other",
          "Draw", "KeyPress", "KeyRelease", "Trigger", "CleanUp", "Gesture", "PreCreate"]


def s16(v):
    v &= 0xFFFF
    return v - 0x10000 if v & 0x8000 else v


# ---------------------------------------------------------------- data model

class Instr:
    __slots__ = ("addr", "size", "op", "word", "t1", "t2", "inst", "val", "ref", "vtype",
                 "target", "argc", "ext", "cmp", "extra", "magic", "var", "func", "code")

    def __init__(self, addr, op, word):
        self.addr = addr
        self.op = op
        self.word = word
        self.size = 4
        self.t1 = self.t2 = 0
        self.inst = 0
        self.val = None
        self.ref = None      # raw operand word for references
        self.vtype = None
        self.target = None
        self.argc = 0
        self.ext = None
        self.cmp = 0
        self.extra = 0
        self.magic = False
        self.var = None
        self.func = None
        self.code = None

    @property
    def name(self):
        if self.op == 0xFF:
            return EXT.get(self.ext, "break")
        return OPS.get(self.op, "op%02X" % self.op)


class Var:
    __slots__ = ("index", "name", "inst", "varid", "occ", "first", "found")

    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)
        self.found = 0


class Func:
    __slots__ = ("index", "name", "occ", "first", "found")

    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)
        self.found = 0


class Code:
    __slots__ = ("index", "name", "length", "locals", "args", "flag", "addr", "offset",
                 "parent", "children", "instrs", "end")

    def __init__(self, **kw):
        self.parent = None
        self.children = []
        self.instrs = []
        self.end = None
        for k, v in kw.items():
            setattr(self, k, v)

    @property
    def start(self):
        return self.addr + self.offset


class GMData:
    def __init__(self, path):
        with open(path, "rb") as f:
            self.d = f.read()
        d = self.d
        if d[:4] != b"FORM":
            raise ValueError("not a FORM file")
        self.chunks = {}
        p, end = 8, 8 + struct.unpack_from("<I", d, 4)[0]
        while p < end:
            ln = struct.unpack_from("<I", d, p + 4)[0]
            self.chunks[d[p:p + 4].decode("ascii")] = (p + 8, ln)
            p += 8 + ln
        self.bytecode = d[self.chunks["GEN8"][0] + 1]
        self.errors = []
        self._load_strings()
        self._load_names()
        self._load_code()
        self._decode()
        self._load_vari()
        self._load_func()
        self._resolve_chains()

    # -- primitives
    def u32(self, o): return struct.unpack_from("<I", self.d, o)[0]
    def i32(self, o): return struct.unpack_from("<i", self.d, o)[0]
    def u16(self, o): return struct.unpack_from("<H", self.d, o)[0]

    def str_at(self, ptr):
        if ptr == 0:
            return None
        n = self.u32(ptr - 4)
        return self.d[ptr:ptr + n].decode("utf-8", "replace")

    def ptrlist(self, chunk):
        if chunk not in self.chunks or self.chunks[chunk][1] < 4:
            return []
        o = self.chunks[chunk][0]
        c = self.u32(o)
        return list(struct.unpack_from("<%dI" % c, self.d, o + 4))

    # -- tables
    def _load_strings(self):
        self.strings = [self.d[p + 4:p + 4 + self.u32(p)].decode("utf-8", "replace")
                        for p in self.ptrlist("STRG")]
        self.string_ptr_index = {p + 4: i for i, p in enumerate(self.ptrlist("STRG"))}

    def _load_names(self):
        self.assets = {}
        for kind, chunk in (("spr", "SPRT"), ("snd", "SOND"), ("obj", "OBJT"), ("room", "ROOM"),
                            ("font", "FONT"), ("bg", "BGND"), ("scr", "SCPT"), ("path", "PATH"),
                            ("shd", "SHDR"), ("tl", "TMLN"), ("seq", "SEQN"), ("ac", "ACRV")):
            names = []
            for p in self.ptrlist(chunk):
                try:
                    names.append(self.str_at(self.u32(p)) if p else None)
                except Exception:
                    names.append(None)
            self.assets[kind] = names
        self.obj_by_name = {n: i for i, n in enumerate(self.assets["obj"]) if n}
        self.inferred_args = {}

    def _load_code(self):
        self.code = []
        roots = {}
        for i, p in enumerate(self.ptrlist("CODE")):
            name = self.str_at(self.u32(p))
            length = self.u32(p + 4)
            loc = self.u16(p + 8)
            args = self.u16(p + 10)
            rel = self.i32(p + 12)
            c = Code(index=i, name=name, length=length, locals=loc, args=args & 0x7FFF,
                     flag=bool(args & 0x8000), addr=p + 12 + rel, offset=self.u32(p + 16))
            if length > 0 and c.addr in roots:
                c.parent = roots[c.addr]
                c.parent.children.append(c)
            elif length > 0:
                roots[c.addr] = c
            self.code.append(c)
        self.code_by_name = {c.name: c for c in self.code}

    def _decode(self):
        self.instr = {}
        for c in self.code:
            if c.parent is not None or c.length == 0:
                continue
            p, end = c.addr, c.addr + c.length
            while p < end:
                ins = self._decode_one(p)
                ins.code = c
                c.instrs.append(ins)
                self.instr[p] = ins
                p += ins.size
            if p != end:
                self.errors.append("%s: decoding overran entry end" % c.name)
        for c in self.code:
            if c.parent is not None:
                c.instrs = c.parent.instrs
        # branch target validation
        for c in self.code:
            if c.parent is not None:
                continue
            for ins in c.instrs:
                if ins.target is not None and not ins.magic:
                    if ins.target not in self.instr or self.instr[ins.target].code is not c:
                        if ins.target != c.addr + c.length:
                            self.errors.append("%s: branch at %x to non-instruction %x"
                                               % (c.name, ins.addr, ins.target))

    def _decode_one(self, p):
        w = self.u32(p)
        op = w >> 24
        ins = Instr(p, op, w)
        b2 = (w >> 16) & 0xFF
        if op in SINGLE or op in DOUBLE or op == 0x15:
            ins.t1, ins.t2 = b2 & 0xF, b2 >> 4
            ins.extra = w & 0xFF
            ins.cmp = (w >> 8) & 0xFF
        elif op in GOTO:
            v = w & 0xFFFFFF
            if v == 0xF00000:
                ins.magic = True
            else:
                if v & 0x400000:
                    v |= 0x800000
                if v & 0x800000:
                    v -= 0x1000000
                ins.target = p + v * 4
        elif op == 0x45:
            ins.t1, ins.t2 = b2 & 0xF, b2 >> 4
            ins.inst = s16(w)
            if ins.t1 != T_SHORT:
                ins.ref = self.u32(p + 4)
                ins.vtype = (ins.ref >> 24) & 0xF8
                ins.size = 8
            else:
                ins.extra = w & 0xFFFF
        elif op in PUSH:
            ins.t1 = b2
            ins.inst = s16(w)
            t = b2
            if t == T_DOUBLE:
                ins.val = struct.unpack_from("<d", self.d, p + 4)[0]
                ins.size = 12
            elif t == T_INT:
                ins.val = self.i32(p + 4)
                ins.ref = self.u32(p + 4)
                ins.size = 8
            elif t == T_LONG:
                ins.val = struct.unpack_from("<q", self.d, p + 4)[0]
                ins.size = 12
            elif t == T_VAR:
                ins.ref = self.u32(p + 4)
                ins.vtype = (ins.ref >> 24) & 0xF8
                ins.size = 8
            elif t == T_STR:
                ins.val = self.u32(p + 4)
                ins.size = 8
            elif t == T_SHORT:
                ins.val = s16(w)
            elif t in (T_BOOL, T_FLOAT):
                self.errors.append("push of type %d at %x (no operand assumed)" % (t, p))
            else:
                self.errors.append("unknown push type %d at %x" % (t, p))
        elif op == 0xD9:
            ins.t1 = b2 & 0xF
            ins.argc = w & 0xFFFF
            ins.ref = self.u32(p + 4)
            ins.size = 8
        elif op == 0xFF:
            ins.ext = s16(w)
            ins.t1 = b2
            if ins.ext not in EXT:
                self.errors.append("unknown extended opcode %d at %x" % (ins.ext, p))
            if b2 == T_INT:
                ins.ref = self.u32(p + 4)
                ins.val = self.i32(p + 4)
                ins.size = 8
        else:
            self.errors.append("unknown opcode %02X at %x" % (op, p))
        return ins

    def _load_vari(self):
        o, ln = self.chunks["VARI"]
        self.vari_header = (self.u32(o), self.u32(o + 4), self.u32(o + 8))
        self.vars = []
        p, i = o + 12, 0
        while p + 20 <= o + ln:
            self.vars.append(Var(index=i, name=self.str_at(self.u32(p)), inst=self.i32(p + 4),
                                 varid=self.i32(p + 8), occ=self.u32(p + 12), first=self.i32(p + 16)))
            p += 20
            i += 1

    def _load_func(self):
        o, ln = self.chunks["FUNC"]
        n = self.u32(o)
        self.funcs = []
        for i in range(n):
            p = o + 4 + 12 * i
            self.funcs.append(Func(index=i, name=self.str_at(self.u32(p)), occ=self.u32(p + 4),
                                   first=self.i32(p + 8)))
        self.code_locals = {}
        p = o + 4 + 12 * n
        if p + 4 <= o + ln:      # code locals (absent from GM 2024.8 on); inline list
            cnt = self.u32(p)
            q = p + 4
            for _ in range(cnt):
                lc = self.u32(q)
                nm = self.str_at(self.u32(q + 4))
                self.code_locals[nm] = [(self.u32(q + 8 + 8 * k), self.str_at(self.u32(q + 12 + 8 * k)))
                                        for k in range(lc)]
                q += 8 + 8 * lc

    def _resolve_chains(self):
        def walk(obj, attr):
            if obj.occ == 0:
                return
            a = obj.first
            if a not in self.instr and (a - 4) in self.instr:
                a -= 4
            for k in range(obj.occ):
                ins = self.instr.get(a)
                if ins is None or ins.ref is None:
                    self.errors.append("%s chain of %r broken at occurrence %d (addr %x)"
                                       % (attr, obj.name, k, a))
                    return
                if getattr(ins, attr) is not None:
                    self.errors.append("instruction %x claimed twice (%s)" % (a, obj.name))
                setattr(ins, attr, obj)
                obj.found += 1
                a += ins.ref & 0x07FFFFFF
            # the last link holds the name's string id
            last = ins.ref & 0xFFFFFF
            if last < len(self.strings) and self.strings[last] != obj.name:
                self.errors.append("%s chain of %r ends with string id %d (%r)"
                                   % (attr, obj.name, last, self.strings[last]))
        for v in self.vars:
            walk(v, "var")
        for f in self.funcs:
            walk(f, "func")
        # every reference-bearing instruction must be resolved
        for ins in self.instr.values():
            if ins.op in (0x45,) and ins.t1 != T_SHORT and ins.var is None:
                self.errors.append("unresolved pop variable at %x" % ins.addr)
            if ins.op in PUSH and ins.t1 == T_VAR and ins.var is None:
                self.errors.append("unresolved push variable at %x" % ins.addr)
            if ins.op == 0xD9 and ins.func is None:
                self.errors.append("unresolved call at %x" % ins.addr)

    # -- names
    def asset_name(self, kind, idx):
        lst = self.assets.get(kind, [])
        if isinstance(idx, int) and 0 <= idx < len(lst):
            return lst[idx]
        return None


# ---------------------------------------------------------------- per-entry analysis

class Entry:
    """A code entry's instruction range, labels, nested bodies and stack dataflow."""

    def __init__(self, g, c):
        self.g, self.c = g, c
        root = c.parent or c
        self.root = root
        self.instrs = root.instrs
        self.idx = {ins.addr: k for k, ins in enumerate(self.instrs)}
        self.endaddr = root.addr + root.length
        self.lo = self.idx.get(c.start, len(self.instrs))
        self.hi = len(self.instrs)
        if c.parent is not None and self.lo > 0:
            prev = self.instrs[self.lo - 1]
            if prev.op == 0xB6 and prev.target > c.start:
                self.hi = self.tindex(prev.target)
        # nested function bodies (other child entries) are jumped over and skipped
        self.skips = {}
        for ch in root.children:
            if ch is c:
                continue
            k = self.idx.get(ch.start)
            if k is None or not (self.lo < k < self.hi):
                continue
            prev = self.instrs[k - 1]
            if prev.op == 0xB6 and prev.target > ch.start:
                self.skips.setdefault(k - 1, []).append(ch)
        # drop skips nested inside another skip
        for k in list(self.skips):
            t = self.tindex(self.instrs[k].target)
            for k2 in list(self.skips):
                if k < k2 < t:
                    self.skips[k].extend(self.skips.pop(k2))
        self.refs = {}
        for k in self.reachable_range():
            ins = self.instrs[k]
            if ins.target is not None and not ins.magic:
                self.refs.setdefault(self.tindex(ins.target), []).append(k)
        self.errors = []
        self.depth = self.dataflow()

    def reachable_range(self):
        k = self.lo
        while k < self.hi:
            yield k
            if k in self.skips:
                k = self.tindex(self.instrs[k].target)
            else:
                k += 1

    def tindex(self, addr):
        if addr == self.endaddr:
            return len(self.instrs)
        return self.idx.get(addr, -1)

    def label(self, k):
        if k >= len(self.instrs):
            return "L%d" % (self.root.length // 4)
        return "L%d" % ((self.instrs[k].addr - self.root.addr) // 4)

    def succ(self, k):
        ins = self.instrs[k]
        op = ins.op
        if k in self.skips:
            return [self.tindex(ins.target)]
        if op in (0x9C, 0x9D):
            return []
        if op == 0xB6:
            return [self.tindex(ins.target)]
        if op in (0xB7, 0xB8, 0xBA) or (op == 0xBB and not ins.magic):
            return [k + 1, self.tindex(ins.target)]
        return [k + 1]

    def effect(self, k, st):
        """Stack effect on a list of (type, int16 const or None) entries."""
        ins = self.instrs[k]
        op = ins.op
        st = list(st)

        def pop():
            if not st:
                raise IndexError("stack underflow")
            return st.pop()

        if op in PUSH:
            if ins.t1 == T_VAR:
                self._var_left(ins, st, pop, push=True)
                st.append((T_VAR, None))
            elif ins.t1 == T_SHORT:
                st.append((T_SHORT, ins.val))
            else:
                st.append((ins.t1, None))
        elif op == 0x45:
            if ins.t1 == T_SHORT:
                e1, e2, e3 = pop(), pop(), pop()
                if ins.extra == 5:
                    st += [e1, e3, e2]
                else:
                    e4 = pop()
                    st += [e1, e4, e3, e2]
            else:
                if ins.t1 == T_INT:
                    pop()
                self._var_left(ins, st, pop, push=False)
                if ins.t1 != T_INT:
                    pop()
        elif op in (0x9E, 0x9C):
            pop()
        elif op == 0x07:
            t, v = pop()
            st.append((ins.t2, v))
        elif op in BINOP:
            pop()
            pop()
            st.append((binary_type(ins), None))
        elif op == 0x15:
            pop()
            pop()
            st.append((T_BOOL, None))
        elif op in (0x11, 0x12):
            t, _ = pop()
            st.append((t, None))
        elif op == 0x86:
            dup_stack(ins, st, lambda e: TYPE_SIZE.get(e[0], 16))
        elif op == 0xD9:
            for _ in range(ins.argc):
                pop()
            if not (ins.func and ins.func.name in NO_RESULT_CALLS):
                st.append((T_VAR, None))
        elif op == 0x99:
            pop()
            pop()
            for _ in range(ins.extra):
                pop()
            st.append((T_VAR, None))
        elif op in (0xB7, 0xB8):
            pop()
        elif op == 0xBA:
            t, v = pop()
            if t == T_SHORT and v == -9:
                pop()
        elif op == 0xFF:
            e = ins.ext
            if e == -5:
                pop()
            elif e in (-2, -4):
                pop()
                pop()
                st.append((T_VAR, None))
            elif e == -3:
                pop()
                pop()
                pop()
            elif e == -6:
                st.append((T_BOOL, None))
            elif e == -10:
                pop()
                st.append((T_BOOL, None))
            elif e == -11:
                st.append((T_VAR if ins.func else T_INT, None))
        return st

    @staticmethod
    def _var_left(ins, st, pop, push):
        vt = ins.vtype
        left = None
        if push and ins.inst == -9:
            left = pop()
        elif vt == VT_STACKTOP:
            left = pop()
        elif vt == VT_ARRAY:
            pop()
            left = pop()
        elif push and vt in (VT_MPUSH, VT_MPUSHPOP):
            pop()
            left = pop()
        if left is not None and left[0] == T_SHORT and left[1] == -9:
            pop()

    def dataflow(self):
        depth = {}
        work = [(self.lo, ())]
        self.merge_checks = 0
        while work:
            k, st = work.pop()
            if k < 0 or k >= self.hi:
                if k < 0 or (k > self.hi and k != len(self.instrs)):
                    self.errors.append("flow leaves entry range (%d)" % k)
                continue
            if k in depth:
                self.merge_checks += 1
                old = depth[k]
                if [TYPE_SIZE.get(t, 16) for t, _ in old] != [TYPE_SIZE.get(t, 16) for t, _ in st]:
                    self.errors.append("stack mismatch at %s: %d vs %d entries"
                                       % (self.label(k), len(old), len(st)))
                continue
            depth[k] = st
            try:
                nst = tuple(self.effect(k, st))
            except IndexError as ex:
                self.errors.append("%s at %s (%s)" % (ex, self.label(k), self.instrs[k].name))
                nst = ()
            for s in self.succ(k):
                work.append((s, nst))
        return depth


NO_RESULT_CALLS = {"@@throw@@", "@@CopyStatic@@", "@@try_unhook@@", "@@finish_catch@@", "@@SetStatic@@"}


def binary_type(ins):
    a, b = ins.t1, ins.t2
    if T_VAR in (a, b):
        return T_VAR
    if T_STR in (a, b):
        return T_STR
    if T_DOUBLE in (a, b):
        return T_DOUBLE
    if T_LONG in (a, b):
        return T_LONG
    if a == T_BOOL and b == T_BOOL:
        return T_BOOL
    return T_INT


def dup_stack(ins, st, size_of, mark=None):
    """Apply dup (normal, or 'dup swap' mode) to list st in place."""
    tsize = TYPE_SIZE.get(ins.t1, 16)
    n1 = ins.extra
    n2 = (ins.cmp & 0x7F) >> 3
    if ins.t1 == T_SHORT:      # dup.e: dup.v with reversed encoding
        tsize = 16
        n1, n2 = n2, n1
    if n2:
        if ins.t1 == T_VAR and n1 == 0:
            return
        top, bot = [], []
        need = n1 * tsize
        while need > 0:
            e = st.pop()
            top.append(e)
            need -= size_of(e)
        need2 = n2 * tsize
        while need2 > 0:
            e = st.pop()
            bot.append(e)
            need2 -= size_of(e)
        if need < 0 or need2 < 0:
            raise IndexError("dup swap size mismatch")
        st.extend(reversed(top))
        st.extend(reversed(bot))
        return
    need = (n1 + 1) * tsize
    items = []
    while need > 0:
        e = st.pop()
        items.append(e)
        if mark:
            mark(e)
        need -= size_of(e)
    if need < 0:
        raise IndexError("dup size mismatch")
    items.reverse()
    st.extend(items)
    st.extend(items)


# ---------------------------------------------------------------- disassembly

ASSET_TYPES_2023 = {0: "obj", 1: "spr", 2: "snd", 3: "room", 4: "bg", 5: "path", 6: "scr",
                    7: "font", 8: "tl", 10: "shd", 11: "seq", 12: "ac"}


def inst_name(g, t, vtype=None):
    if vtype == VT_INSTANCE:
        return "inst%d" % (t + 100000)
    if t in INST:
        return INST[t]
    return g.asset_name("obj", t) or ("obj#%d" % t)


def fmt_str(s):
    out = []
    for ch in s:
        if ch == "\\":
            out.append("\\\\")
        elif ch == '"':
            out.append('\\"')
        elif ch == "\n":
            out.append("\\n")
        elif ch == "\r":
            out.append("\\r")
        elif ch == "\t":
            out.append("\\t")
        elif ord(ch) < 32:
            out.append("\\x%02x" % ord(ch))
        else:
            out.append(ch)
    return '"' + "".join(out) + '"'


def fmt_num(v):
    if isinstance(v, float):
        if v != v or v in (float("inf"), float("-inf")):
            return repr(v)
        if v == int(v) and abs(v) < 1e15:
            return str(int(v))
        return repr(v)
    return str(v)


def asset_ref_text(g, val):
    kind = ASSET_TYPES_2023.get((val >> 24) & 0xFF)
    idx = val & 0xFFFFFF
    nm = g.asset_name(kind, idx) if kind else None
    return nm or "asset(%d,%d)" % ((val >> 24) & 0xFF, idx)


def var_asm(g, ins):
    vn = ins.var.name if ins.var else "?"
    pre = "[%s]" % VT_NAME.get(ins.vtype, "%02x" % ins.vtype) if ins.vtype != VT_NORMAL else ""
    return "%s%s.%s" % (pre, inst_name(g, ins.inst, ins.vtype), vn)


def disasm_line(g, e, k):
    ins = e.instrs[k]
    nm = ins.name
    op = ins.op
    tc = lambda t: TYPE_CH.get(t, str(t))
    if op in SINGLE:
        s = "%s.%s" % (nm, tc(ins.t1))
        if op == 0x86:
            s += " %d" % ins.extra
            if ins.cmp:
                # dup-swap: second operand in the same type units as the first
                s += " swap=%d" % ((ins.cmp & 0x7F) >> 3)
        elif op == 0x99:
            s += " %d" % ins.extra
    elif op in DOUBLE:
        s = "%s.%s.%s" % (nm, tc(ins.t1), tc(ins.t2))
    elif op == 0x15:
        s = "cmp.%s.%s %s" % (tc(ins.t1), tc(ins.t2), CMP_NAME.get(ins.cmp, ins.cmp))
    elif op in GOTO:
        if ins.magic:
            s = nm + " <drop>"
        else:
            t = e.tindex(ins.target)
            s = "%s %s" % (nm, e.label(t) if t >= 0 else "?%x" % ins.target)
    elif op == 0x45:
        if ins.t1 == T_SHORT:
            s = "pop.%s.%s %d" % (tc(ins.t1), tc(ins.t2), ins.extra)
        else:
            s = "pop.%s.%s %s" % (tc(ins.t1), tc(ins.t2), var_asm(g, ins))
    elif op in PUSH:
        s = "%s.%s " % (nm, tc(ins.t1))
        t = ins.t1
        if t == T_VAR:
            s += var_asm(g, ins)
        elif ins.func is not None:
            s += "[function]" + ins.func.name
        elif ins.var is not None:
            s += "[variable]" + ins.var.name
        elif t == T_STR:
            s += fmt_str(g.strings[ins.val]) if ins.val < len(g.strings) else "<bad string %d>" % ins.val
        else:
            s += fmt_num(ins.val)
    elif op == 0xD9:
        s = "call.%s %s(argc=%d)" % (tc(ins.t1), ins.func.name if ins.func else "?", ins.argc)
    elif op == 0xFF:
        s = "%s.%s" % (nm, tc(ins.t1))
        if ins.ext not in EXT:
            s += " %d" % ins.ext
        if ins.ref is not None:
            s += " [function]" + ins.func.name if ins.func is not None else " " + asset_ref_text(g, ins.val)
    else:
        s = "?? %08x" % ins.word
    return s


def entry_bytes(e):
    if e.c.parent is None:
        return e.c.length
    if e.hi <= e.lo:
        return 0
    last = e.instrs[e.hi - 1]
    return last.addr + last.size - e.c.start


def disassemble(g, c, e=None):
    e = e or Entry(g, c)
    lines = ["; %s  length=%d locals=%d args=%d%s" % (c.name, entry_bytes(e), c.locals, c.args,
                                                       " (locals flag)" if c.flag else "")]
    if c.parent is not None:
        lines.append("; child of %s, byte offset %d" % (c.parent.name, c.offset))
    if c.children:
        lines.append("; child entries: " + ", ".join(ch.name for ch in c.children))
    lines.append(";  addr  depth  instruction")
    k = e.lo
    while k < e.hi:
        if k in e.refs:
            lines.append("%s:" % e.label(k))
        d = e.depth.get(k)
        lines.append("    %05d %3s  %s" % ((e.instrs[k].addr - e.root.addr) // 4,
                                         "-" if d is None else len(d), disasm_line(g, e, k)))
        if k in e.skips:
            lines.append("    ; (function bodies skipped here: %s)"
                         % ", ".join(ch.name for ch in e.skips[k]))
            k = e.tindex(e.instrs[k].target)
            continue
        k += 1
    if e.hi in e.refs:
        lines.append("%s:  ; end" % e.label(e.hi))
    for err in e.errors:
        lines.append("; CHECK: " + err)
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------- expression nodes

P_TERNARY, P_OR, P_AND, P_UNARY, P_POSTFIX, P_ATOM = 0.5, 1, 2, 11, 12, 13


class Node:
    stype = T_VAR
    dup = False
    prec = P_ATOM

    def r(self, ctx):
        raise NotImplementedError

    def wrap(self, ctx, p):
        s = self.r(ctx)
        return "(%s)" % s if self.prec < p else s


class Const(Node):
    def __init__(self, value, kind, stype):
        self.value, self.kind, self.stype = value, kind, stype
        self.ann = None

    def r(self, ctx):
        if self.kind == "s":
            return fmt_str(self.value)
        if self.kind == "b":
            return "true" if self.value else "false"
        s = fmt_num(self.value)
        if self.ann:
            s += ctx.ann_text(self.value, self.ann)
        return s

    @property
    def prec(self):
        if self.kind not in ("s", "b") and self.value < 0:
            return P_UNARY
        return P_ATOM


class FuncRef(Node):
    def __init__(self, name):
        self.name = name

    def r(self, ctx):
        return short_func(self.name)


class VarHash(Node):
    def __init__(self, name):
        self.name = name
        self.stype = T_INT

    def r(self, ctx):
        return "/*varhash*/%s" % self.name


class InstNode(Node):
    def __init__(self, t, vtype):
        self.t, self.vtype = t, vtype

    def r(self, ctx):
        return inst_name(ctx.g, self.t, self.vtype)


class Ph(Node):
    """Placeholder for an unknown/structural stack value."""

    def __init__(self, text, dup=False):
        self.text = text
        self.dup = dup

    def r(self, ctx):
        return "/*%s*/" % self.text


class Variable(Node):
    prec = P_POSTFIX

    def __init__(self, var, vtype, left, idx):
        self.var, self.vtype, self.left, self.idx = var, vtype, left, idx

    @property
    def name(self):
        return self.var.name if self.var else "?"

    def r(self, ctx):
        left = self.left
        t = None
        vt = None
        if isinstance(left, InstNode):
            t, vt = left.t, left.vtype
        elif isinstance(left, Const) and left.kind in ("e", "i"):
            t = left.value
        if t is not None:
            if vt == VT_INSTANCE:
                pre = "inst%d." % (t + 100000)
            elif t in (-1, -6, -7, -15, -16) or (t == 0 and vt == VT_STACKTOP):
                pre = ""
            elif t in INST:
                pre = INST[t] + "."
            else:
                pre = (ctx.g.asset_name("obj", t) or "obj#%d" % t) + "."
        else:
            pre = left.wrap(ctx, P_POSTFIX) + "."
        s = pre + self.name
        for i in self.idx or ():
            s += "[%s]" % i.r(ctx)
        return s


class Bin(Node):
    def __init__(self, op, a, b, stype):
        self.op, self.a, self.b, self.stype = op, a, b, stype
        self.prec = PREC[op]

    def r(self, ctx):
        # left-assoc: right operand of equal precedence needs parentheses
        pa, pb = self.prec, self.prec + 0.1
        # GML and C/JS rank & | ^ differently against comparisons and each other: always group
        if self.op in BITWISE:
            if isinstance(self.a, Bin) and self.a.op != self.op and self.a.prec <= 7:
                pa = 99
            if isinstance(self.b, Bin) and self.b.prec <= 7:
                pb = 99
        return "%s %s %s" % (self.a.wrap(ctx, pa), self.op, self.b.wrap(ctx, pb))


BITWISE = ("&", "|", "^")


class Un(Node):
    prec = P_UNARY

    def __init__(self, op, a, stype):
        self.op, self.a, self.stype = op, a, stype

    def r(self, ctx):
        s = self.a.wrap(ctx, P_UNARY)
        if s[:1] in ("-", "~", "!") and self.op == "-":
            s = "(%s)" % s      # never print "--x"
        return self.op + s


class Call(Node):
    prec = P_POSTFIX

    def __init__(self, name, args):
        self.name, self.args = name, args

    def r(self, ctx):
        n = self.name
        if n == "@@NewGMLArray@@":
            return "[%s]" % ", ".join(a.r(ctx) for a in self.args)
        if n in ("@@This@@", "@@Other@@", "@@Global@@") and not self.args:
            return {"@@This@@": "self", "@@Other@@": "other", "@@Global@@": "global"}[n]
        return "%s(%s)" % (short_func(n), ", ".join(a.r(ctx) for a in self.args))


class NewObj(Node):
    prec = P_POSTFIX

    def __init__(self, fn, args):
        self.fn, self.args = fn, args

    def r(self, ctx):
        if self.fn is None:
            return "{}"
        return "new %s(%s)" % (self.fn.wrap(ctx, P_POSTFIX), ", ".join(a.r(ctx) for a in self.args))


class CallV(Node):
    prec = P_POSTFIX

    def __init__(self, fn, inst, args):
        self.fn, self.inst, self.args = fn, inst, args

    def r(self, ctx):
        a = ", ".join(x.r(ctx) for x in self.args)
        f = self.fn.wrap(ctx, P_POSTFIX)
        if self.inst is None:
            return "%s(%s)" % (f, a)
        return "%s(%s) /*on %s*/" % (f, a, self.inst.r(ctx))


class Ternary(Node):
    prec = P_TERNARY

    def __init__(self, c, a, b):
        self.c, self.a, self.b = c, a, b

    def r(self, ctx):
        return "%s ? %s : %s" % (self.c.wrap(ctx, P_AND + 0.5), self.a.wrap(ctx, P_OR), self.b.wrap(ctx, P_OR))


class Logic(Node):
    def __init__(self, op, terms):
        self.op, self.terms = op, terms
        self.prec = P_AND if op == "&&" else P_OR
        self.stype = T_BOOL

    def r(self, ctx):
        return (" %s " % self.op).join(t.wrap(ctx, self.prec + 0.1) for t in self.terms)


class Not(Node):
    prec = P_UNARY
    stype = T_BOOL

    def __init__(self, a):
        self.a = a

    def r(self, ctx):
        return "!" + self.a.wrap(ctx, P_UNARY)


class IncDec(Node):
    prec = P_POSTFIX

    def __init__(self, var, op, prefix):
        self.var, self.op, self.prefix = var, op, prefix

    def r(self, ctx):
        v = self.var.r(ctx)
        return self.op + v if self.prefix else v + self.op


def negate(n):
    if isinstance(n, Not):
        return n.a
    if isinstance(n, Bin) and n.op in ("==", "!=", "<", "<=", ">", ">="):
        flip = {"==": "!=", "!=": "==", "<": ">=", ">=": "<", ">": "<=", "<=": ">"}
        return Bin(flip[n.op], n.a, n.b, n.stype)
    if isinstance(n, Const) and n.kind == "b":
        return Const(not n.value, "b", T_BOOL)
    return Not(n)


def has_side_effect(n):
    if isinstance(n, (Call, CallV, NewObj, IncDec)):
        return True
    for a in ("a", "b", "c", "left", "fn", "inst"):
        x = getattr(n, a, None)
        if isinstance(x, Node) and has_side_effect(x):
            return True
    for a in ("idx", "args", "terms"):
        for x in getattr(n, a, None) or ():
            if has_side_effect(x):
                return True
    return False


def compound_op(tgt, val):
    """'+' etc. when val is tgt <op> rhs reusing tgt's duplicated instance/index nodes and those
    have side effects (then 'tgt = tgt + rhs' would misstate how often they run), else None."""
    if not (isinstance(val, Bin) and val.op in ("+", "-", "*", "/", "&", "|", "^")):
        return None
    v = val.a
    if not (isinstance(v, Variable) and v.var is tgt.var and v.left is tgt.left
            and len(v.idx or ()) == len(tgt.idx or ())
            and all(x is y for x, y in zip(v.idx or (), tgt.idx or ()))):
        return None
    if has_side_effect(tgt.left) or any(has_side_effect(x) for x in tgt.idx or ()):
        return val.op
    return None


def same_stack(a, b):
    return len(a) == len(b) and all(x is y for x, y in zip(a, b))


def short_func(name):
    return name[11:] if name.startswith("gml_Script_") else name


def is_const(n, v):
    return isinstance(n, Const) and n.kind in ("e", "i", "b", "d") and n.value == v


# ---------------------------------------------------------------- asset annotation

_A = {}
for _fns, _arg, _kind in (
        (["draw_sprite", "draw_sprite_ext", "draw_sprite_part", "draw_sprite_part_ext",
          "draw_sprite_stretched", "draw_sprite_stretched_ext", "draw_sprite_tiled",
          "draw_sprite_tiled_ext", "draw_sprite_general", "draw_sprite_pos", "sprite_get_width",
          "sprite_get_height", "sprite_get_number", "sprite_get_xoffset", "sprite_get_yoffset",
          "sprite_get_name", "sprite_get_texture", "sprite_get_uvs", "sprite_get_bbox_left",
          "sprite_get_bbox_right", "sprite_get_bbox_top", "sprite_get_bbox_bottom", "sprite_exists",
          "sprite_set_offset", "sprite_get_speed", "sprite_get_tpe", "draw_sprite_ext_flash"], 0, "spr"),
        (["scr_marker", "scr_dark_marker"], 2, "spr"),
        (["audio_play_sound", "audio_stop_sound", "audio_is_playing", "audio_sound_gain",
          "audio_sound_pitch", "audio_pause_sound", "audio_resume_sound", "audio_sound_length",
          "audio_sound_get_gain", "audio_sound_get_pitch", "audio_exists", "audio_get_name",
          "audio_play_sound_at", "audio_sound_set_track_position", "audio_is_paused",
          "snd_play", "snd_loop", "snd_stop", "snd_volume", "snd_pitch", "snd_is_playing",
          "snd_pause", "snd_resume", "snd_free", "snd_play_x", "snd_play_pitch", "snd_play_volume"], 0, "snd"),
        (["audio_play_sound_on"], 1, "snd"),
        (["instance_exists", "instance_number", "instance_find", "instance_change", "object_get_name",
          "object_get_sprite", "object_get_parent", "object_get_depth", "object_is_ancestor",
          "instance_activate_object", "instance_deactivate_object", "instance_destroy",
          "event_perform_object", "distance_to_object", "scr_pan_to_obj", "object_get_mask",
          "object_get_visible", "object_get_persistent", "object_exists"], 0, "obj"),
        (["object_is_ancestor"], 1, "obj"),
        (["instance_nearest", "instance_furthest", "instance_place", "instance_position",
          "place_meeting", "position_meeting", "collision_point", "instance_create",
          "instance_place_list", "instance_position_list"], 2, "obj"),
        (["collision_circle", "instance_create_depth", "instance_create_layer"], 3, "obj"),
        (["collision_rectangle", "collision_line", "collision_ellipse"], 4, "obj"),
        (["room_goto", "room_get_name", "room_exists", "room_instance_add"], 0, "room"),
        (["draw_set_font", "font_get_name", "font_get_size", "font_exists"], 0, "font"),
        (["path_start", "path_get_length", "path_get_x", "path_get_y", "path_get_number"], 0, "path"),
        (["script_execute"], 0, "scr")):
    for _f in _fns:
        _A.setdefault(_f, {}).setdefault(_arg, []).append(_kind)
FUNC_ARGS = _A

VAR_EXACT = {"sprite_index": ["spr"], "mask_index": ["spr"], "object_index": ["obj"], "room": ["room"]}


ARG_RX = re.compile(r"^argument(\d+)$")


def arg_number(n):
    """argumentN / argument[N] variable node -> N, else None."""
    if not isinstance(n, Variable):
        return None
    m = ARG_RX.match(n.name)
    if m and not n.idx:
        return int(m.group(1))
    if n.name == "argument" and n.idx and len(n.idx) == 1 and isinstance(n.idx[0], Const) \
            and isinstance(n.idx[0].value, int):
        return n.idx[0].value
    return None


KIND_ORDER = ["spr", "snd", "obj", "room", "font", "bg", "path", "scr"]


def infer_script_params(g):
    """Asset kinds of user-script parameters, inferred from how each script uses argumentN
    (passed on to a known asset parameter, assigned to sprite_index, with(), ...), to a fixpoint."""
    direct, edges = {}, []
    for c in g.code:
        if not c.name.startswith("gml_Script_"):
            continue
        try:
            d = Decompiler(g, c)
            d.run(d.e.lo, d.e.hi, [], [])
        except Exception:
            continue
        sn = short_func(c.name)
        for kind, a, b in d.obs:
            if kind == "kinds":
                direct.setdefault((sn, a), set()).update(b)
            else:
                edges.append(((sn, a), b))
    res = {k: set(v) for k, v in direct.items()}
    changed = True
    while changed:
        changed = False
        for src, (callee, i) in edges:
            ks = set(FUNC_ARGS.get(callee, {}).get(i, ())) | res.get((callee, i), set())
            if ks - res.get(src, set()):
                res.setdefault(src, set()).update(ks)
                changed = True
    out = {}
    for (sn, i), ks in res.items():
        if sn in FUNC_ARGS and i in FUNC_ARGS[sn]:
            continue
        if ks:
            out.setdefault(sn, {})[i] = sorted(ks, key=KIND_ORDER.index)
    g.inferred_args = out
    return out


def var_kinds(name):
    if not name:
        return None
    if name in VAR_EXACT:
        return VAR_EXACT[name]
    n = name.lower()
    k = []
    if n.endswith("sprite") or n.startswith("spr_") or n.endswith("_spr"):
        k.append("spr")
    if n.endswith("sound") or n.startswith("snd_") or n.endswith("_snd"):
        k.append("snd")
    if n.endswith("_obj") or n.endswith("object") or n.startswith("obj_"):
        k.append("obj")
    return k or None


# ---------------------------------------------------------------- decompiler

class PatFail(Exception):
    pass


class FailList(list):
    def append(self, x):
        raise PatFail()


class Decompiler:
    def __init__(self, g, c, e=None):
        self.g, self.c = g, c
        self.e = e or Entry(g, c)
        self.instrs = self.e.instrs
        self.consumed = set()      # branch sources that are not printed as gotos
        self.snap = {}
        self.lref = {}
        self.locals = []
        self.notes = []
        self.raw_count = 0
        self.switch_vals = set()
        self.label_stack = {}
        self.warnings = 0
        self.obs = []

    # -- helpers
    def ann_text(self, v, kinds):
        if not isinstance(v, int):
            if isinstance(v, float) and v == int(v):
                v = int(v)
            else:
                return ""
        names = []
        for k in kinds:
            if k == "obj" and v in (-1, -2, -3, -4):
                names.append((k, INST[v]))
                continue
            nm = self.g.asset_name(k, v)
            if nm:
                names.append((k, nm))
        if not names:
            return ""
        if len(names) == 1:
            return "/*%s*/" % names[0][1]
        return "/*%s*/" % "|".join("%s:%s" % kv for kv in names)

    def annotate(self, n, kinds):
        if not kinds:
            return
        if isinstance(n, Const) and n.kind in ("e", "i", "d", "l"):
            if n.ann is None:
                n.ann = list(kinds)
        elif isinstance(n, Ternary):
            self.annotate(n.a, kinds)
            self.annotate(n.b, kinds)

    def visible(self, k):
        return [s for s in self.e.refs.get(k, ()) if s not in self.consumed]

    def asm(self, k):
        return "%05d: %s" % ((self.instrs[k].addr - self.e.root.addr) // 4, disasm_line(self.g, self.e, k))

    def add_local(self, var):
        if var and var.inst == -7 and var.name not in self.locals:
            self.locals.append(var.name)

    # -- main simulation over [lo, hi)
    def run(self, lo, hi, stack, out, expr=False):
        k = lo
        live = True
        while k < hi:
            if k in self.e.refs and not (expr and k == lo):
                if expr:
                    raise PatFail()
                stack = self.enter_label(k, stack, live, out)
            live = True
            ins = self.instrs[k]
            op = ins.op
            nxt = k + 1
            depth_before = len(stack)
            try:
                if k in self.e.skips:
                    if expr:
                        raise PatFail()
                    self.consumed.add(k)
                    out.append(("c", "function bodies defined here: " + ", ".join(
                        ch.name for ch in self.e.skips[k])))
                    nxt = self.e.tindex(ins.target)
                elif op in (0xB7, 0xB8):
                    res = self.try_value(k, stack, hi)
                    if res is not None:
                        stack, nxt = res
                    else:
                        if expr:
                            raise PatFail()
                        cond = self.pop(stack, k, out)
                        if op == 0xB8:
                            cond = negate(cond)
                        t = self.e.tindex(ins.target)
                        self.jump(k, t, cond, stack, out)
                elif op == 0xB6:
                    if expr:
                        raise PatFail()
                    self.jump(k, self.e.tindex(ins.target), None, stack, out)
                    live = False
                elif op == 0x86 and self.is_repeat(k):
                    if expr:
                        raise PatFail()
                    stack, nxt = self.do_repeat(k, stack, out)
                elif op == 0xBA:
                    if expr:
                        raise PatFail()
                    stack, nxt = self.do_with(k, stack, out)
                else:
                    if expr and op in (0x45, 0x9E, 0x9C, 0x9D, 0xBB) and not (op == 0x45 and ins.t1 == T_SHORT):
                        raise PatFail()
                    n0 = len(out)
                    dead = self.step(k, stack, out)
                    if dead:
                        live = False
                    if k not in self.e.depth and not isinstance(out, FailList):
                        for m in range(n0, len(out)):
                            if out[m][0] in ("assign", "expr"):
                                out[m] = ("dead", out[m])
            except PatFail:
                raise
            except Exception as ex:
                if expr:
                    raise PatFail()
                self.raw_count += 1
                out.append(("c", "[raw] %s   (simulation: %s)" % (self.asm(k), ex)))
                want = self.e.depth.get(k + 1)
                if want is not None:
                    del stack[len(want):]
                    while len(stack) < len(want):
                        stack.append(Ph("?"))
            k = nxt
        return stack

    def pop(self, stack, k, out):
        if stack:
            return stack.pop()
        self.raw_count += 1
        out.append(("c", "[raw] %s   (stack underflow)" % self.asm(k)))
        return Ph("underflow")

    def jump(self, k, t, cond, stack, out):
        if k not in self.e.depth:      # unreachable code: no merge to check
            self.lref[t] = self.lref.get(t, 0) + 1
            out.append(("if", cond, t) if cond is not None else ("goto", t))
            return
        if t in self.label_stack and not same_stack(self.label_stack[t], stack):
            self.warn(out, "stack value(s) carried along the jump to %s differ from those at the label: "
                      "%s vs %s" % (self.e.label(t), self.stack_text(stack), self.stack_text(self.label_stack[t])))
        if t not in self.snap:
            self.snap[t] = list(stack)
        elif not same_stack(self.snap[t], stack):
            self.warn(out, "jumps to %s carry different stack values" % self.e.label(t))
        self.lref[t] = self.lref.get(t, 0) + 1
        out.append(("if", cond, t) if cond is not None else ("goto", t))

    def enter_label(self, k, stack, live, out):
        if self.visible(k):
            out.append(("L", k))
        want = self.e.depth.get(k)
        if not live:
            if k in self.snap:
                stack = list(self.snap[k])
            elif want is not None:
                stack = [Ph("stack%d" % i) for i in range(len(want))]
            else:
                stack = []
        elif k in self.snap and not same_stack(self.snap[k], stack):
            self.warn(out, "stack values differ at merge into %s: fallthrough %s vs jump %s"
                      % (self.e.label(k), self.stack_text(stack), self.stack_text(self.snap[k])))
        if live and want is not None and len(want) != len(stack):
            self.warn(out, "simulated stack height %d, expected %d" % (len(stack), len(want)))
            del stack[len(want):]
            while len(stack) < len(want):
                stack.append(Ph("?"))
        self.label_stack[k] = list(stack)
        return stack

    def warn(self, out, text):
        self.warnings += 1
        if isinstance(out, FailList):
            raise PatFail()
        out.append(("c", "WARNING: " + text))

    def stack_text(self, st):
        return "[%s]" % ", ".join(n.r(self) for n in st)

    # -- value patterns: a && b, a || b, c ? x : y
    def try_value(self, k, stack, hi):
        ins = self.instrs[k]
        if not stack:
            return None
        T = self.e.tindex(ins.target)
        if T <= k + 1 or T > hi:
            return None
        j = T - 1
        bj = self.instrs[j]
        if bj.op != 0xB6 or bj.magic:
            return None
        E = self.e.tindex(bj.target)
        if E <= T or E > hi:
            return None
        splits = []
        for m in range(k + 1, j):
            im = self.instrs[m]
            if im.target is not None and not im.magic:
                tm = self.e.tindex(im.target)
                if tm == T:
                    if im.op != ins.op:
                        return None
                    splits.append(m)
                elif not (k < tm <= E):
                    return None
            if m in self.e.skips:
                return None
        for m in range(T, E):
            im = self.instrs[m]
            if im.target is not None and not im.magic:
                if not (k < self.e.tindex(im.target) <= E):
                    return None
        for L in range(k + 1, E + 1):
            for s in self.e.refs.get(L, ()):
                if not (k <= s < E):
                    return None
        if self.e.refs.get(E, []) != [j]:
            return None
        base = stack[:-1]
        cond0 = stack[-1]
        terms = [cond0]
        saved = set(self.consumed)
        try:
            a = k + 1
            for m in splits + [j]:
                st = self.run(a, m, list(base), FailList(), expr=True)
                if len(st) != len(base) + 1 or any(x is not y for x, y in zip(st, base)):
                    raise PatFail()
                terms.append(st[-1])
                a = m + 1
            st = self.run(T, E, list(base), FailList(), expr=True)
            if len(st) != len(base) + 1 or any(x is not y for x, y in zip(st, base)):
                raise PatFail()
            other = st[-1]
        except PatFail:
            self.consumed = saved
            return None
        # short-circuit && / || put a lone "push.e 0/1" (opcode 0xC0) in the other arm;
        # "c ? x : 0" compiles to pushi.e (0x84) and must stay a ternary
        oi = self.instrs[T]
        sc = E == T + 1 and oi.op == 0xC0 and oi.t1 == T_SHORT
        if sc and ins.op == 0xB8 and is_const(other, 0) and len(terms) >= 2:
            node = Logic("&&", terms)
        elif sc and ins.op == 0xB7 and is_const(other, 1) and len(terms) >= 2:
            node = Logic("||", terms)
        elif not splits and ins.op == 0xB8:
            node = Ternary(cond0, terms[1], other)
        elif not splits and ins.op == 0xB7:
            node = Ternary(cond0, other, terms[1])
        else:
            self.consumed = saved
            return None
        self.consumed.update([k, j] + splits)
        return base + [node], E

    # -- repeat (n) { ... }
    def is_repeat(self, k):
        I = self.instrs
        try:
            a, b, c, d = I[k], I[k + 1], I[k + 2], I[k + 3]
            isint = lambda x, v: x.op in PUSH and x.t1 in (T_INT, T_SHORT) and x.val == v and x.func is None
            if not (a.t1 == T_INT and a.extra == 0 and a.cmp == 0 and isint(b, 0)
                    and c.op == 0x15 and c.cmp == 2 and d.op == 0xB7):
                return False
            T = self.e.tindex(d.target)
            if T <= k + 8 or T >= self.e.hi:
                return False
            p, sub, du, cv, bt = I[T - 5], I[T - 4], I[T - 3], I[T - 2], I[T - 1]
            return (I[T].op == 0x9E and isint(p, 1) and sub.op == 0x0D
                    and du.op == 0x86 and du.extra == 0 and cv.op == 0x07 and cv.t2 == T_BOOL
                    and bt.op == 0xB7 and self.e.tindex(bt.target) == k + 4)
        except IndexError:
            return False

    def do_repeat(self, k, stack, out):
        I = self.instrs
        T = self.e.tindex(I[k + 3].target)
        count = self.pop(stack, k, out)
        self.consumed.update([k + 3, T - 1])
        items = []
        counter = Ph("repeat counter", dup=True)
        st = self.run(k + 4, T - 5, stack + [counter], items)
        if self.visible(T - 5):
            items.append(("L", T - 5))
        if not (st and st[-1] is counter):
            self.warn(items, "repeat counter not at stack top at loop end")
        out.append(("repeat", count, items, T - 5, T))
        if self.visible(T):
            out.append(("L", T))
        return stack, T + 1

    # -- with (inst) { ... }
    def do_with(self, k, stack, out):
        ins = self.instrs[k]
        P = self.e.tindex(ins.target)
        pe = self.instrs[P] if 0 <= P < len(self.instrs) else None
        if pe is None or pe.op != 0xBB or pe.magic or self.e.tindex(pe.target) != k + 1 or P >= self.e.hi:
            raise ValueError("unmatched pushenv")
        inst = self.pop(stack, k, out)
        if isinstance(inst, Const) and inst.value == -9:
            inst = self.pop(stack, k, out)
        self.annotate(inst, ["obj"])
        na = arg_number(inst)
        if na is not None:
            self.obs.append(("kinds", na, ["obj"]))
        self.consumed.update([k, P])
        items = []
        st = self.run(k + 1, P, list(stack), items)
        if self.visible(P):
            items.append(("L", P))
        if len(st) != len(stack):
            self.warn(items, "stack height changed inside with-block")
        out.append(("with", inst, items, P))
        return stack, P + 1

    # -- single instruction semantics; returns True if control does not fall through
    def step(self, k, stack, out):
        ins = self.instrs[k]
        op = ins.op
        g = self.g
        pop = lambda: self.pop(stack, k, out)
        if op in PUSH:
            t = ins.t1
            if t == T_VAR:
                stack.append(self.read_var(ins, stack, k, out))
            elif ins.func is not None:
                stack.append(FuncRef(ins.func.name))
            elif ins.var is not None:
                stack.append(VarHash(ins.var.name))
            elif t == T_STR:
                stack.append(Const(g.strings[ins.val], "s", T_STR))
            elif t == T_SHORT:
                stack.append(Const(ins.val, "e", T_SHORT))
            elif t == T_INT:
                stack.append(Const(ins.val, "i", T_INT))
            elif t == T_LONG:
                stack.append(Const(ins.val, "l", T_LONG))
            elif t == T_DOUBLE:
                stack.append(Const(ins.val, "d", T_DOUBLE))
            else:
                raise ValueError("push type %d" % t)
        elif op == 0x45:
            if ins.t1 == T_SHORT:
                e1, e2, e3 = pop(), pop(), pop()
                if ins.extra == 5:
                    stack += [e1, e3, e2]
                else:
                    e4 = pop()
                    stack += [e1, e4, e3, e2]
            else:
                self.write_var(ins, stack, k, out)
        elif op == 0x9E:
            n = pop()
            if isinstance(n, (Call, CallV, NewObj, IncDec)) and not n.dup:
                out.append(("expr", n))
            elif n.dup or isinstance(n, Ph):
                out.append(("swpop", n))
            else:
                self.warn(out, "discarded value: %s" % n.r(self))
        elif op == 0x9C:
            out.append(("ret", pop()))
            return True
        elif op == 0x9D:
            out.append(("exit",))
            return True
        elif op == 0x07:
            n = stack[-1] if stack else pop()
            if isinstance(n, Const) and n.kind == "e" and n.value in (0, 1) and ins.t1 == T_BOOL:
                stack[-1] = Const(bool(n.value), "b", ins.t2)
            elif not stack:
                stack.append(n)
            else:
                n.stype = ins.t2
        elif op in BINOP:
            b, a = pop(), pop()
            o = BINOP[op]
            if op in (0x0E, 0x0F) and ins.t1 == T_BOOL and ins.t2 == T_BOOL:
                o = "&&" if op == 0x0E else "||"
                stack.append(Logic(o, [a, b]))
            else:
                if ins.t1 == T_BOOL and isinstance(b, Const) and b.kind == "e" and b.value in (0, 1):
                    b = Const(bool(b.value), "b", T_BOOL)
                stack.append(Bin(o, a, b, binary_type(ins)))
        elif op == 0x15:
            b, a = pop(), pop()
            o = CMP.get(ins.cmp)
            if o is None:
                raise ValueError("bad comparison kind %d" % ins.cmp)
            if o in ("==", "!="):
                for x, y in ((a, b), (b, a)):
                    if isinstance(x, Variable):
                        self.annotate(y, var_kinds(x.name))
                        na = arg_number(y)
                        if na is not None and var_kinds(x.name):
                            self.obs.append(("kinds", na, var_kinds(x.name)))
            stack.append(Bin(o, a, b, T_BOOL))
        elif op == 0x11:
            stack.append(Un("-", pop(), ins.t1))
        elif op == 0x12:
            a = pop()
            stack.append(Not(a) if ins.t1 == T_BOOL else Un("~", a, ins.t1))
        elif op == 0x86:
            dup_stack(ins, stack, lambda n: TYPE_SIZE.get(n.stype, 16), mark=lambda n: setattr(n, "dup", True))
        elif op == 0xD9:
            self.do_call(ins, stack, k, out)
        elif op == 0x99:
            fn = pop()
            inst = pop()
            args = [pop() for _ in range(ins.extra)]
            if isinstance(fn, Variable) and fn.left is inst:
                inst = None
            if isinstance(inst, Call) and inst.name == "@@This@@":
                inst = None
            stack.append(CallV(fn, inst, args))
        elif op == 0xBB:
            if ins.magic:
                out.append(("c", "popenv <drop>: leave the with-loop"))
            else:
                raise ValueError("popenv outside a recognised with-block")
        elif op == 0xFF:
            e = ins.ext
            if e == -5:
                pop()
            elif e in (-2, -4):
                idx = pop()
                v = pop()
                if not isinstance(v, Variable):
                    raise ValueError("multi-dim array push without array variable")
                stack.append(Variable(v.var, v.vtype, v.left, (v.idx or []) + [idx]))
            elif e == -3:
                idx = pop()
                v = pop()
                if not isinstance(v, Variable):
                    raise ValueError("multi-dim array pop without array variable")
                tgt = Variable(v.var, v.vtype, v.left, (v.idx or []) + [idx])
                val = pop()
                if self.incdec(tgt, val, stack):
                    return False
                self.annotate(val, var_kinds(tgt.name))
                out.append(("assign", tgt, val))
                self.reuse_assigned(tgt, val, stack)
            elif e == -6:
                stack.append(Call("@@isstaticok@@", []))
            elif e == -10:
                stack.append(Call("@@isnullish@@", [pop()]))
            elif e == -11:
                if ins.func is not None:
                    stack.append(FuncRef(ins.func.name))
                else:
                    stack.append(Const(asset_ref_text(g, ins.val), "s", T_INT))
            elif e == -7:
                out.append(("c", "setstatic"))
            # chkindex, savearef, restorearef: no stack effect
        else:
            raise ValueError("unhandled opcode")
        return False

    def read_var(self, ins, stack, k, out):
        pop = lambda: self.pop(stack, k, out)
        vt = ins.vtype
        idx = None
        if ins.inst == -9 or vt == VT_STACKTOP:
            left = pop()
        elif vt == VT_ARRAY or vt in (VT_MPUSH, VT_MPUSHPOP):
            idx = [pop()]
            left = pop()
        else:
            left = InstNode(ins.inst, vt)
        if isinstance(left, Const) and left.value == -9:
            left = pop()
        self.add_local(ins.var)
        return Variable(ins.var, vt, left, idx)

    def write_var(self, ins, stack, k, out):
        pop = lambda: self.pop(stack, k, out)
        val = None
        if ins.t1 == T_INT:
            val = pop()
        vt = ins.vtype
        idx = None
        if vt == VT_STACKTOP:
            left = pop()
        elif vt == VT_ARRAY:
            idx = [pop()]
            left = pop()
        else:
            left = InstNode(ins.inst, vt)
        if isinstance(left, Const) and left.value == -9:
            left = pop()
        tgt = Variable(ins.var, vt, left, idx)
        self.add_local(ins.var)
        if ins.t1 != T_INT:
            val = pop()
        if ins.t2 == T_BOOL and isinstance(val, Const) and val.kind == "e" and val.value in (0, 1):
            val = Const(bool(val.value), "b", T_BOOL)
        if self.incdec(tgt, val, stack):
            return
        self.annotate(val, var_kinds(tgt.name))
        na = arg_number(val)
        if na is not None and var_kinds(tgt.name):
            self.obs.append(("kinds", na, var_kinds(tgt.name)))
        out.append(("assign", tgt, val))
        self.reuse_assigned(tgt, val, stack)

    @staticmethod
    def reuse_assigned(tgt, val, stack):
        """A duplicated side-effecting value that was just stored and is still on the stack
        (e.g. 'S = method(...)' then 'new S()') is read back through the variable, so the
        call is not printed twice."""
        if val is not None and val.dup and has_side_effect(val) and not has_side_effect(tgt):
            for n, x in enumerate(stack):
                if x is val:
                    tgt.dup = True
                    stack[n] = tgt

    def incdec(self, tgt, val, stack):
        """Detect ++x / x++ used inside an expression (value kept on the stack)."""
        if isinstance(val, Bin) and val.op in ("+", "-") and is_const(val.b, 1):
            op = "++" if val.op == "+" else "--"
            if val.dup and stack and stack[-1] is val:
                stack.pop()
                stack.append(IncDec(tgt, op, True))
                return True
            if val.a.dup and stack and stack[-1] is val.a:
                stack.pop()
                stack.append(IncDec(tgt, op, False))
                return True
        return False

    def do_call(self, ins, stack, k, out):
        pop = lambda: self.pop(stack, k, out)
        name = ins.func.name if ins.func else "?"
        n = ins.argc
        if name == "@@NewGMLObject@@":
            if n == 0:
                stack.append(NewObj(None, []))
            else:
                fn = pop()
                stack.append(NewObj(fn, [pop() for _ in range(n - 1)]))
            return
        if name == "@@throw@@":
            out.append(("s", "throw %s;" % pop().r(self)))
            return
        if name in NO_RESULT_CALLS:
            args = [pop() for _ in range(n)]
            out.append(("c", "%s(%s)" % (name, ", ".join(a.r(self) for a in args))))
            return
        args = [pop() for _ in range(n)]
        sn = short_func(name)
        for i, kinds in list(FUNC_ARGS.get(sn, {}).items()) + list(self.g.inferred_args.get(sn, {}).items()):
            if i < len(args):
                self.annotate(args[i], kinds)
        for i, a in enumerate(args):
            na = arg_number(a)
            if na is not None:
                self.obs.append(("edge", na, (sn, i)))
        stack.append(Call(name, args))

    # -- driver
    def decompile(self):
        out = []
        st = self.run(self.e.lo, self.e.hi, [], out)
        if self.e.hi in self.e.refs and self.visible(self.e.hi):
            out.append(("L", self.e.hi))
        if st:
            self.warn(out, "%d value(s) left on the stack at end" % len(st))
        self.structure(out, set())
        return out

    # ---------------------------------------------------------- structuring
    def structure(self, items, follow):
        changed = True
        while changed:
            changed = self.structure_once(items, follow)
        for i, it in enumerate(items):
            nf = self.follow_of(items, i, follow)
            kind = it[0]
            if kind == "ifb":
                self.structure(it[2], nf)
                if it[3] is not None:
                    self.structure(it[3], nf)
            elif kind in ("while", "do", "switch"):
                self.structure(it[2] if kind != "do" else it[1], set())
            elif kind == "repeat":
                self.loop_jumps(it[2], it[3], it[4], items, i)
                self.structure(it[2], set())
            elif kind == "with":
                self.structure(it[2], set())

    def follow_of(self, items, i, follow):
        f = set()
        j = i + 1
        while j < len(items) and items[j][0] in ("L", "swpop"):
            if items[j][0] == "L":
                f.add(items[j][1])
            j += 1
        if j >= len(items):
            f |= follow
        return f

    def label_pos(self, items):
        return {it[1]: i for i, it in enumerate(items) if it[0] == "L"}

    def deref(self, t):
        self.lref[t] = self.lref.get(t, 0) - 1

    def structure_once(self, items, follow):
        pos = self.label_pos(items)
        for i, it in enumerate(items):
            kind = it[0]
            # redundant goto to the immediately following label
            if kind == "goto":
                if it[1] in self.follow_of(items, i, follow):
                    self.deref(it[1])
                    del items[i]
                    return True
            if kind == "L":
                H = it[1]
                # while (c) { ... }
                if i + 1 < len(items) and items[i + 1][0] == "if":
                    _, c, E = items[i + 1]
                    m = pos.get(E)
                    if m is None and E in follow and len(items) > i + 2 and items[-1] == ("goto", H):
                        m = len(items)
                    if m is not None and m > i + 2 and items[m - 1] == ("goto", H):
                        body = items[i + 2:m - 1]
                        self.deref(H)
                        self.deref(E)
                        self.loop_jumps(body, H, E, None, None)
                        items[i + 1:m] = [("while", negate(c), body)]
                        return True
                # do { ... } until (c)
                for m in range(i + 1, len(items)):
                    x = items[m]
                    if x[0] == "if" and x[2] == H and self.lref.get(H) == 1:
                        body = items[i + 1:m]
                        self.deref(H)
                        items[i + 1:m + 1] = [("do", body, negate(x[1]))]
                        return True
            if kind == "if":
                c, T = it[1], it[2]
                if self.try_switch(items, i):
                    return True
                m = pos.get(T)
                if m is None and T in follow:
                    m = len(items)
                if m is None or m <= i:
                    continue
                # if (c) { ... } else { ... }
                if m - 1 > i and items[m - 1][0] == "goto" and self.lref.get(T) == 1:
                    T2 = items[m - 1][1]
                    n = pos.get(T2)
                    if n is not None and n > m and m < len(items):
                        then, els = items[i + 1:m - 1], items[m + 1:n]
                        self.deref(T)
                        self.deref(T2)
                        items[i:n] = [("ifb", negate(c), then, els)]
                        return True
                    if n is None and T2 in follow and m < len(items):
                        then, els = items[i + 1:m - 1], items[m + 1:]
                        self.deref(T)
                        self.deref(T2)
                        items[i:] = [("ifb", negate(c), then, els)]
                        return True
                # if (c) { ... }
                self.deref(T)
                items[i:m] = [("ifb", negate(c), items[i + 1:m], None)]
                return True
        return False

    def try_switch(self, items, i):
        it = items[i]
        c = it[1]
        if not (isinstance(c, Bin) and c.op == "==" and c.a.dup):
            return False
        X = c.a
        cases = []
        j = i
        while j < len(items) and items[j][0] == "if" and isinstance(items[j][1], Bin) \
                and items[j][1].op == "==" and items[j][1].a is X:
            cases.append((items[j][1].b, items[j][2]))
            j += 1
        if j >= len(items) or items[j][0] != "goto":
            return False
        D = items[j][1]
        end = None
        for m in range(len(items) - 1, j, -1):
            if items[m][0] == "swpop" and items[m][1] is X:
                end = m
                break
        if end is None:
            return False
        pos = self.label_pos(items)
        Lend = items[end - 1][1] if items[end - 1][0] == "L" else None
        for _, L in cases + [(None, D)]:
            if L == Lend:
                continue
            if L not in pos or not (j < pos[L] < end):
                return False
        body = []
        for m in range(j + 1, end - (1 if Lend is not None else 0)):
            x = items[m]
            if x[0] == "L":
                for cv, L in cases:
                    if L == x[1]:
                        body.append(("case", cv))
                        self.deref(L)
                if D == x[1] and D != Lend:
                    body.append(("default",))
                    self.deref(D)
            body.append(x)
        for cv, L in cases:
            if L == Lend:
                body.append(("case", cv))
                self.deref(L)
        if D == Lend:
            self.deref(D)
        if Lend is not None:
            self.loop_jumps(body, None, Lend, None, None)
        # the compiler's unreachable "b end" after the default jump precedes the first case
        while body and body[0][0] in ("break", "goto"):
            if body[0][0] == "goto":
                self.deref(body[0][1])
            del body[0]
        self.switch_vals.add(id(X))
        repl = [("switch", X, body)]
        if Lend is not None:
            repl.append(("L", Lend))
        items[i:end + 1] = repl
        return True

    def loop_jumps(self, body, cont, brk, parent, pi):
        """Turn gotos to the loop's continue/break labels into continue/break (same loop level)."""
        for n, x in enumerate(body):
            k = x[0]
            if k == "goto" and cont is not None and x[1] == cont and not (
                    n == len(body) - 1 and False):
                body[n] = ("continue",)
                self.deref(cont)
            elif k == "goto" and brk is not None and x[1] == brk:
                body[n] = ("break",)
                self.deref(brk)
            elif k == "ifb":
                self.loop_jumps(x[2], cont, brk, None, None)
                if x[3] is not None:
                    self.loop_jumps(x[3], cont, brk, None, None)

    # ---------------------------------------------------------- rendering
    def render(self, items, ind=0):
        lines = []
        pad = "    " * ind
        prev = None
        for x in items:
            k = x[0]
            if k != "swpop":
                prev = x
            if k == "L":
                if self.lref.get(x[1], 0) > 0:
                    lines.append("%s%s:" % ("    " * max(ind - 1, 0) + "  ", self.e.label(x[1])))
            elif k == "s":
                lines.append(pad + x[1])
            elif k == "c":
                lines.append(pad + "// " + x[1])
            elif k == "dead":
                for s in self.render([x[1]], ind):
                    lines.append(pad + "// unreachable: " + s.strip())
            elif k == "assign":
                cop = compound_op(x[1], x[2])
                if cop:
                    # lvalue evaluated once in the bytecode (dup); writing it twice would repeat calls
                    lines.append("%s%s %s= %s;" % (pad, x[1].r(self), cop, x[2].b.wrap(self, 0)))
                else:
                    lines.append("%s%s = %s;" % (pad, x[1].r(self), x[2].r(self)))
            elif k == "expr":
                lines.append("%s%s;" % (pad, x[1].r(self)))
            elif k == "if":
                lines.append("%sif (%s) goto %s;" % (pad, x[1].r(self), self.e.label(x[2])))
            elif k == "goto":
                lines.append("%sgoto %s;" % (pad, self.e.label(x[1])))
            elif k == "ret":
                lines.append("%sreturn %s;" % (pad, x[1].r(self)))
            elif k == "exit":
                lines.append(pad + "exit;")
            elif k == "swpop":
                if prev is not None and prev[0] == "assign" and (prev[2] is x[1] or prev[1] is x[1]):
                    pass
                elif not isinstance(x[1], Ph) and id(x[1]) not in self.switch_vals:
                    lines.append(pad + "// (discard duplicated stack value: %s)" % x[1].r(self))
            elif k in ("break", "continue"):
                lines.append(pad + k + ";")
            elif k == "case":
                lines.append("    " * max(ind - 1, 0) + "  case %s:" % x[1].r(self))
            elif k == "default":
                lines.append("    " * max(ind - 1, 0) + "  default:")
            elif k == "ifb":
                lines.append("%sif (%s)" % (pad, x[1].r(self)))
                lines += self.block(x[2], ind)
                els = x[3]
                while els is not None:
                    if len(els) == 1 and els[0][0] == "ifb":
                        lines.append("%selse if (%s)" % (pad, els[0][1].r(self)))
                        lines += self.block(els[0][2], ind)
                        els = els[0][3]
                    else:
                        lines.append(pad + "else")
                        lines += self.block(els, ind)
                        els = None
            elif k == "while":
                lines.append("%swhile (%s)" % (pad, x[1].r(self)))
                lines += self.block(x[2], ind)
            elif k == "do":
                # x[2] is already the until-condition (negated loop-back condition)
                lines.append(pad + "do")
                lines += self.block(x[1], ind)
                lines.append("%suntil (%s);" % (pad, x[2].r(self)))
            elif k == "repeat":
                lines.append("%srepeat (%s)" % (pad, x[1].r(self)))
                lines += self.block(x[2], ind)
            elif k == "with":
                lines.append("%swith (%s)" % (pad, x[1].r(self)))
                lines += self.block(x[2], ind)
            elif k == "switch":
                lines.append("%sswitch (%s)" % (pad, x[1].r(self)))
                lines += self.block(x[2], ind)
            else:
                lines.append(pad + "// ?? %r" % (x,))
        return lines

    def block(self, items, ind):
        pad = "    " * ind
        return [pad + "{"] + self.render(items, ind + 1) + [pad + "}"]


def entry_info(g, c):
    """(object name, event) for gml_Object_* entries."""
    m = re.match(r"^gml_Object_(.+)_(%s)_(.+)$" % "|".join(EVENTS), c.name)
    if not m:
        return "", ""
    obj, ev, sub = m.group(1), m.group(2), m.group(3)
    if obj not in g.obj_by_name:
        # object names may contain event-like words; try every split
        for ev2 in EVENTS:
            for mm in re.finditer("_%s_" % ev2, c.name):
                o = c.name[len("gml_Object_"):mm.start()]
                if o in g.obj_by_name:
                    return o, ev2 + "_" + c.name[mm.end():]
    return obj, ev + "_" + sub


def decompile_text(g, c):
    e = Entry(g, c)
    d = Decompiler(g, c, e)
    items = d.decompile()
    body = d.render(items)
    head = ["// %s" % c.name,
            "// length=%d bytes, locals=%d, args=%d%s" % (entry_bytes(e), c.locals, c.args,
                                                           ", child of " + c.parent.name if c.parent else "")]
    obj, ev = entry_info(g, c)
    if obj:
        head.append("// object %s, event %s" % (obj, ev))
    if d.locals:
        head.append("// locals: " + ", ".join(d.locals))
    for err in e.errors:
        head.append("// CHECK: " + err)
    if d.raw_count:
        head.append("// NOTE: %d instruction(s) emitted raw (see [raw] comments)" % d.raw_count)
    return "\n".join(head + [""] + body) + "\n", e, d


# ---------------------------------------------------------------- CLI

def safe_name(n):
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", n)


def process(g, c):
    """Returns (gml, asm, entry, decompiler); never raises."""
    try:
        gml, e, d = decompile_text(g, c)
    except Exception as ex:      # keep going; the asm is still written
        e, d = Entry(g, c), None
        gml = "// %s\n// DECOMPILER FAILURE: %r -- see asm/%s.asm\n" % (c.name, ex, safe_name(c.name))
    return gml, disassemble(g, c, e), e, d


def self_check(g, results):
    """results: list of (code, entry, decompiler). Returns report lines and failure flag."""
    rep = []
    bad = False
    unknown = [x for x in g.errors if "unknown" in x]
    rep.append("unknown opcodes/types: %d" % len(unknown))
    bad |= bool(unknown)
    br = [x for x in g.errors if "branch" in x]
    rep.append("branch targets not on instruction boundaries: %d" % len(br))
    bad |= bool(br)
    nv = sum(v.found != v.occ for v in g.vars)
    nf = sum(f.found != f.occ for f in g.funcs)
    rep.append("VARI chains not matching occurrence count: %d of %d" % (nv, len(g.vars)))
    rep.append("FUNC chains not matching occurrence count: %d of %d" % (nf, len(g.funcs)))
    bad |= bool(nv or nf)
    other = [x for x in g.errors if x not in unknown and x not in br]
    rep.append("other parse errors: %d" % len(other))
    rep += ["  " + x for x in other[:50]]
    merges = sum(e.merge_checks for _, e, _ in results)
    mism = [(c.name, x) for c, e, _ in results for x in e.errors]
    rep.append("stack merge points checked: %d, inconsistent: %d" % (merges, len(mism)))
    rep += ["  %s: %s" % m for m in mism[:50]]
    bad |= bool(mism)
    fails = [c.name for c, _, d in results if d is None]
    raws = [(c.name, d.raw_count) for c, _, d in results if d is not None and d.raw_count]
    rep.append("decompiler failures: %d" % len(fails))
    rep += ["  " + x for x in fails[:50]]
    rep.append("entries with raw-emitted instructions: %d (total %d)"
               % (len(raws), sum(n for _, n in raws)))
    rep += ["  %s: %d" % x for x in raws[:50]]
    warns = [(c.name, d.warnings) for c, _, d in results if d is not None and d.warnings]
    rep.append("entries with simulation WARNING comments: %d (total %d)"
               % (len(warns), sum(n for _, n in warns)))
    rep += ["  %s: %d" % x for x in warns[:50]]
    rep.append("entries processed: %d / CODE count %d" % (len(results), len(g.code)))
    bad |= len(results) != len(g.code)
    return rep, bad


def dump_all(g, outdir):
    os.makedirs(os.path.join(outdir, "asm"), exist_ok=True)
    results = []
    index = ["entry\tbytes\tlocals\targs\tobject\tevent\tparent"]
    written = set()
    for c in g.code:
        gml, asm, e, d = process(g, c)
        fn = safe_name(c.name)
        if fn.lower() in written:
            fn += "__%d" % c.index
        written.add(fn.lower())
        with open(os.path.join(outdir, fn + ".gml"), "w", encoding="utf-8", newline="\n") as f:
            f.write(gml)
        with open(os.path.join(outdir, "asm", fn + ".asm"), "w", encoding="utf-8", newline="\n") as f:
            f.write(asm)
        obj, ev = entry_info(g, c)
        nbytes = entry_bytes(e)
        index.append("\t".join([c.name, str(nbytes), str(c.locals), str(c.args), obj, ev,
                                c.parent.name if c.parent else ""]))
        results.append((c, e, d))
    with open(os.path.join(outdir, "INDEX.tsv"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(index) + "\n")
    with open(os.path.join(outdir, "ASSET_PARAMS.tsv"), "w", encoding="utf-8", newline="\n") as f:
        f.write("function\targ\tkinds\tsource\n")
        for fn in sorted(FUNC_ARGS):
            for i, ks in sorted(FUNC_ARGS[fn].items()):
                f.write("%s\t%d\t%s\tbuiltin table\n" % (fn, i, ",".join(ks)))
        for fn in sorted(g.inferred_args):
            for i, ks in sorted(g.inferred_args[fn].items()):
                f.write("%s\t%d\t%s\tinferred from script body\n" % (fn, i, ",".join(ks)))
    rep, bad = self_check(g, results)
    with open(os.path.join(outdir, "SELFCHECK.txt"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(rep) + "\n")
    return rep, bad


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("datawin")
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("dump-all", help="write <outdir>/<entry>.gml, asm/<entry>.asm, INDEX.tsv")
    d.add_argument("outdir")
    s = sub.add_parser("show", help="print entries whose name equals or matches a regex")
    s.add_argument("pattern")
    s.add_argument("--asm-only", action="store_true")
    s.add_argument("--gml-only", action="store_true")
    sub.add_parser("check", help="run the self-checks over every entry")
    a = ap.parse_args(argv)
    g = GMData(a.datawin)
    infer_script_params(g)
    if a.cmd == "dump-all":
        rep, bad = dump_all(g, a.outdir)
        print("\n".join(rep))
        return 1 if bad else 0
    if a.cmd == "check":
        results = []
        for c in g.code:
            _, _, e, dd = process(g, c)
            results.append((c, e, dd))
        rep, bad = self_check(g, results)
        print("\n".join(rep))
        return 1 if bad else 0
    if a.cmd == "show":
        sel = [c for c in g.code if c.name == a.pattern]
        if not sel:
            rx = re.compile(a.pattern)
            sel = [c for c in g.code if rx.search(c.name)]
        if not sel:
            print("no entry matches %r" % a.pattern, file=sys.stderr)
            return 1
        out = sys.stdout
        for c in sel:
            gml, asm, _, _ = process(g, c)
            if not a.asm_only:
                out.write(gml + "\n")
            if not a.gml_only:
                out.write(asm + "\n")
        return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    sys.exit(main())
