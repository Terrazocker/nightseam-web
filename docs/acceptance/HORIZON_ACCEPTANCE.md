# Horizon owner acceptance

The horizon editor ([rebuild plan](../horizon/HORIZON_REBUILD_PLAN.md)) has
software checks in pytest and the browser suite. These real-world checks are
the owner's. Record the device, browser and what you observed; actual
outcomes go in RELEASES.md.

The real-photo checks were removed on October 15, 2026: the owner found photo
calibration too fiddly on a Pixel 7a, and horizon photos were replaced by
phone-sensor capture ([plan](../horizon/HORIZON_SENSOR_CAPTURE_PLAN.md)),
whose phase 5 adds its own checklist here.

## Devices and accessibility

On the intended touch or pen device, sketch slowly and quickly, drag a point,
interrupt a drag, zoom and pan, and draw an overhang edge. Each gesture should
be one undo step.

With keyboard and the intended screen reader: create a horizon, add points
through *Points by numbers*, select and move them with the arrow keys, delete
one, undo and redo. Check that focus, the save status and the skyline summary
are announced and understandable.
