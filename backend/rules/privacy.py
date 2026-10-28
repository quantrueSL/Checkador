"""Protección de datos personales: los nombres se enmascaran salvo petición explícita."""


def normalize_name(name: str) -> str:
    return " ".join((name or "").split())


def mask_name(name: str) -> str:
    parts = normalize_name(name).split()
    return " ".join(p[0] + "." for p in parts) if parts else "—"


def display_name(name: str, reveal: bool) -> str:
    return normalize_name(name) if reveal else mask_name(name)
