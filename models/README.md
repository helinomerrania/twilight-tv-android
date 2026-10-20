# 3D models for the menu

Put a dish's 3D model in this folder, as a `.glb` file, and choose it for the item on the phone page: **Menu** tab, tap the item, **3D model**. On customers' phones the item's picture then gets a small **AR** chip. Tapping it shows the dish in 3D, turning slowly; a finger turns it, two fingers bring it closer, and the gold **AR** button puts it on their table through the camera (Google's Scene Viewer on Android, AR Quick Look on iPhones and iPads).

Customers' phones fetch the model from here, over the internet (`https://raw.githubusercontent.com/<this project>/main/models/<file>.glb`): AR on Android needs a model at an https address, which the TV box on the café Wi-Fi can't give. So:

- The project stays public, as it is for `settings.json`. Anyone can download the models.
- Adding or changing a model here doesn't build the app again (the build skips this folder), and needs nothing on the TVs. The phone page lists a new file within a minute.

## The file

- **A `.glb` file** (glTF, binary): what Blender and most 3D apps and phone 3D-scanning apps can save. iPhones get their own copy (USDZ) made by the menu page as they open it.
- **Its name:** letters, digits, dots, dashes and underscores, starting with a letter or digit, and no spaces: `kunafa.glb`, `turkish-coffee.glb`. A name of any other shape isn't kept with the item.
- **Small:** under 5 MB opens quickly on a phone; keep it under 15 MB. Fewer polygons and textures of 1024 to 2048 pixels make most of the difference.
- **Its real size, in metres** (a plate about 0.25 m across), standing on the ground at its middle: AR puts it on the table at that size.
- **Its colours on itself** (textures inside the file, not beside it): a `.gltf` with separate files won't do.

## Adding one on GitHub

1. Open the project on github.com, then the `models` folder.
2. **Add file** › **Upload files**, drop the `.glb` in, then **Commit changes**.
3. On the phone page: **Menu** tab, the item, **3D model**, choose the file, **Save**.

To take a model off an item, choose **None** for its 3D model. Delete a file here only once no item uses it: an item whose model isn't here any more shows a crossed-out cloud and a button to try again.
