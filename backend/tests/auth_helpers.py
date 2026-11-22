async def authenticate(client, identity_provider):
    """Complete the mocked Auth0 login so `client` holds a signed-in session cookie."""
    login = await client.get("/api/auth/login")
    assert login.status_code == 302
    params = identity_provider.remember_login(login)
    callback = await client.get(
        "/api/auth/callback", params={"code": "valid-code", "state": params["state"][0]}
    )
    assert callback.status_code == 303
    assert callback.headers["location"] == "http://localhost:3000/success"
    return callback
