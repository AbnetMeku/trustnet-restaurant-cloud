"""Block operational writes on cloud; tenant UI is reporting-only."""

from __future__ import annotations

import re

from flask import Blueprint, jsonify, request

OPERATIONAL_READONLY_MESSAGE = (
    "Cloud operational data is read-only. Configure stores on the local POS."
)

_TENANT_ADMIN_UPDATE = re.compile(r"^/api/tenants/\d+/tenant-admin$")


def _mutating_method() -> bool:
    return request.method in {"POST", "PUT", "PATCH", "DELETE"}


def _admin_mutation_allowed() -> bool:
    """Super-admin control-plane write on admin blueprint."""
    if request.method == "PUT" and _TENANT_ADMIN_UPDATE.match(request.path or ""):
        return True
    return False


def _compat_before_request():
    if request.method == "OPTIONS":
        return None
    if _mutating_method():
        return (
            jsonify({"error": OPERATIONAL_READONLY_MESSAGE}),
            403,
        )
    return None


def _admin_before_request():
    if request.method == "OPTIONS":
        return None
    if _mutating_method() and not _admin_mutation_allowed():
        return (
            jsonify({"error": OPERATIONAL_READONLY_MESSAGE}),
            403,
        )
    return None


_guards_attached = False


def register_reporting_readonly_guards(compat_bp: Blueprint, admin_bp: Blueprint) -> None:
    """Attach before_request handlers once, before blueprints are registered on the app."""
    global _guards_attached
    if _guards_attached:
        return
    compat_bp.before_request(_compat_before_request)
    admin_bp.before_request(_admin_before_request)
    _guards_attached = True
