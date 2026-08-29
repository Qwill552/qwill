import { Router } from 'express';

import { getProfileFontFamilies } from '../../lib/profileFonts.js';

export const cardFontsRouter: Router = Router();

/** Список семейств для редактора. Ничего личного здесь нет — это перечень файлов из
 *  `server/assets/profile-fonts/`, потому и без requireAuth. */
cardFontsRouter.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(getProfileFontFamilies());
});
