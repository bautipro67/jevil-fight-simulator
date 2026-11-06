// Imports every battle-system module so their objects and scripts get registered.
import './misc.js?v=20261106200045';
import './text.js?v=20261106200045';
import './setup.js?v=20261106200045';
import './controller.js?v=20261106200045';
import './heroes.js?v=20261106200045';
import './fight.js?v=20261106200045';
import './damage.js?v=20261106200045';
import './spells.js?v=20261106200045';
import './endbattle.js?v=20261106200045';

export { startBattle } from './setup.js?v=20261106200045';
export { MonsterParent } from './misc.js?v=20261106200045';
