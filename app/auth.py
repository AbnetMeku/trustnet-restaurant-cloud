from functools import wraps

from flask import jsonify, request
from flask_jwt_extended import get_jwt, verify_jwt_in_request


def extract_roles_from_claims(claims):
    roles = set()

    role = claims.get("role")
    if isinstance(role, str) and role.strip():
        roles.add(role.strip().lower())

    legacy_roles = claims.get("roles")
    if isinstance(legacy_roles, list):
        for value in legacy_roles:
            if isinstance(value, str) and value.strip():
                roles.add(value.strip().lower())
    elif isinstance(legacy_roles, str) and legacy_roles.strip():
        roles.add(legacy_roles.strip().lower())

    return roles


def roles_required(*allowed_roles):
    allowed = {role.strip().lower() for role in allowed_roles if isinstance(role, str) and role.strip()}

    def wrapper(fn):
        @wraps(fn)
        def decorator(*args, **kwargs):
            if request.method == "OPTIONS":
                return jsonify({"status": "ok"}), 200

            verify_jwt_in_request()
            roles = extract_roles_from_claims(get_jwt())
            if not any(role in roles for role in allowed):
                return jsonify({"msg": "Forbidden: insufficient role"}), 403
            return fn(*args, **kwargs)

        return decorator

    return wrapper


def tenant_access_required(fn):
    @wraps(fn)
    def decorator(*args, **kwargs):
        verify_jwt_in_request()
        claims = get_jwt()
        roles = extract_roles_from_claims(claims)
        request_tenant_id = kwargs.get("tenant_id")
        if request_tenant_id is None and request.view_args:
            request_tenant_id = request.view_args.get("tenant_id")
        if request_tenant_id is None:
            request_tenant_id = request.args.get("tenant_id", type=int)
        if request_tenant_id is None and request.is_json:
            request_tenant_id = (request.get_json(silent=True) or {}).get("tenant_id")

        if "super_admin" in roles:
            return fn(*args, **kwargs)

        token_tenant_id = claims.get("tenant_id")
        if token_tenant_id is None or int(token_tenant_id) != int(request_tenant_id or 0):
            return jsonify({"msg": "Forbidden: tenant mismatch"}), 403

        return fn(*args, **kwargs)

    return decorator
