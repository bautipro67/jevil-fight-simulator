// Imports every battle-system module so their objects and scripts get registered.
import './misc.js?v=20261114041600';
import './text.js?v=20261114041600';
import './setup.js?v=20261114041600';
import './controller.js?v=20261114041600';
import './heroes.js?v=20261114041600';
import './fight.js?v=20261114041600';
import './damage.js?v=20261114041600';
import './spells.js?v=20261114041600';
import './endbattle.js?v=20261114041600';

export { startBattle } from './setup.js?v=20261114041600';
export { MonsterParent } from './misc.js?v=20261114041600';
