// Imports every battle-system module so their objects and scripts get registered.
import './misc.js';
import './text.js';
import './setup.js';
import './controller.js';
import './heroes.js';
import './fight.js';
import './damage.js';
import './spells.js';
import './endbattle.js';

export { startBattle } from './setup.js';
export { MonsterParent } from './misc.js';
