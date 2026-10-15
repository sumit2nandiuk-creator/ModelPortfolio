# Template – copy this folder to start a new model

This folder is ignored by the build (folder names starting with `_` are never published).

To add a model:

1. Copy this folder to `models/<url-slug>/` (e.g. `models/jane-doe/`). Use lowercase letters, numbers and hyphens only.
2. Rename `"slug"` in `model.json` to exactly the same value as the folder name.
3. Put the model's photos and videos in `models/<url-slug>/media/`.
4. Fill in `model.json`. Every `file`, `poster` and `cover.file` must be a file name that exists in `media/`.
5. Remove this README from the copied folder (it is not used by the site).
6. Run `npm run build`. The new site appears at `dist/<url-slug>/` and is served at `/<url-slug>/`.

The build fails with a clear message if anything is missing or invalid, so you can fix it before deploying.
