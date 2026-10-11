# Horizon owner acceptance

The rebuilt horizon editor ([plan](../horizon/HORIZON_REBUILD_PLAN.md)) has
software checks in pytest and the browser suite. These real-world checks are
the owner's. Record the device, browser, photo source, known directions and
what you observed; actual outcomes go in RELEASES.md.

## Real photos

Use one full 360° panorama from a phone panorama app and one ordinary phone
photo of part of your skyline. Before you start, note the true compass
direction of one landmark in each (correct a magnetic compass reading to true
north) and, if you can, the height angle of one obstruction.

1. **New from photo.** The full panorama should open 360° wide; the ordinary
   photo 60° wide. Correct the width if needed (a phone photo is about 65°).
2. **North.** Use *Set north from a landmark* on the known landmark. Check a
   second landmark against its known direction. Then try dragging the photo in
   Align mode instead and compare.
3. **Skyline.** On a daylight photo use *Detect skyline*; otherwise sketch it.
   Fix wrong stretches by dragging points or sketching over them. Compare an
   obstruction's height on the grid with your measurement.
4. **Planning.** Pick a target that rises behind a tree or roof. Tonight, the
   detail card and Sky View should agree that it is blocked until it clears
   the skyline.
5. **Persistence.** Reload, switch horizons, export a backup, restore it, and
   export/import the horizon as a text file. The skyline and photo placement
   should come back unchanged.

## Devices and accessibility

On the intended touch or pen device, sketch slowly and quickly, drag a point,
interrupt a drag, zoom and pan, and use Align mode. Each gesture should be one
undo step.

With keyboard and the intended screen reader: create a horizon, add points
through *Points by numbers*, select and move them with the arrow keys, delete
one, undo and redo. Check that focus, the save status and the skyline summary
are announced and understandable.
