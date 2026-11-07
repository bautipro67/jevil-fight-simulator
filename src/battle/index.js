// Imports every battle-system module so their objects and scripts get registered.
import './misc.js?v=20261107201439';
import './text.js?v=20261107201439';
import './setup.js?v=20261107201439';
import './controller.js?v=20261107201439';
import './heroes.js?v=20261107201439';
import './fight.js?v=20261107201439';
import './damage.js?v=20261107201439';
import './spells.js?v=20261107201439';
import './endbattle.js?v=20261107201439';

export { startBattle } from './setup.js?v=20261107201439';
export { MonsterParent } from './misc.js?v=20261107201439';
