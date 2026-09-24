"""Theme names shared by the desktop server and its static UI."""

THEME_WORKBENCH = "workbench"
THEME_GLASS = "dome"


def normalize_theme(value) -> str:
    """Return the one canonical theme name understood by the application.

    ``classic`` and the empty value were the old flat/default theme names. They
    remain accepted so existing settings and backups migrate without losing a
    user's choice. Unknown values also fall back to the safe default rather than
    being reflected into a document attribute or CSS selector.
    """
    return THEME_GLASS if value == THEME_GLASS else THEME_WORKBENCH
