// Imports every battle-system module so their objects and scripts get registered.
import './misc.js?v=20261030222208';
import './text.js?v=20261030222208';
import './setup.js?v=20261030222208';
import './controller.js?v=20261030222208';
import './heroes.js?v=20261030222208';
import './fight.js?v=20261030222208';
import './damage.js?v=20261030222208';
import './spells.js?v=20261030222208';
import './endbattle.js?v=20261030222208';

export { startBattle } from './setup.js?v=20261030222208';
export { MonsterParent } from './misc.js?v=20261030222208';
