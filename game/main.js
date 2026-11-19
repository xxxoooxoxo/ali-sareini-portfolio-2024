// The whole game: every chapter, in order.
import { boot } from 'life/game.js';
import { buildUva } from 'life/chapters/uva.js';
import { buildDartmouth } from 'life/chapters/dartmouth.js';
import { buildYc } from 'life/chapters/yc.js';
import { buildSf } from 'life/chapters/sf.js';

boot({ uva: buildUva, dartmouth: buildDartmouth, yc: buildYc, sf: buildSf });
