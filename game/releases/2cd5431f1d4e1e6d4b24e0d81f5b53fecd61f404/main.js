// The whole game: every chapter, in order.
import { boot } from './game.js';
import { buildUva } from './chapters/uva.js';
import { buildDartmouth } from './chapters/dartmouth.js';
import { buildYc } from './chapters/yc.js';
import { buildSf } from './chapters/sf.js';

boot({ uva: buildUva, dartmouth: buildDartmouth, yc: buildYc, sf: buildSf });
