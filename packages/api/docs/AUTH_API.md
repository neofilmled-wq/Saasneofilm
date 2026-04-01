# NeoFilm - Auth API Documentation

Base URL: `http://localhost:3001/api/v1`

## Authentication Flow

### Standard Login (without MFA)
```
POST /auth/login  →  { accessToken, refreshToken, user }
```

### Login with MFA Enabled
```
POST /auth/login  →  { mfaRequired: true, mfaToken }
POST /auth/mfa/verify  →  { accessToken, refreshToken, user }
```

### Device Authentication
```
POST /auth/device  →  { accessToken, device }
```

---

## Auth Endpoints

### POST /auth/register
Create a new user account.

**Auth:** Public
**Rate Limit:** 100/min (default)

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass1",
  "firstName": "John",
  "lastName": "Doe",
  "role": "ADVERTISER"
}
```

**Response (201):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "a1b2c3d4e5f6...",
  "expiresIn": 900,
  "tokenType": "Bearer",
  "user": {
    "id": "clx123...",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "ADVERTISER"
  }
}
```

---

### POST /auth/login
Authenticate with email and password.

**Auth:** Public
**Rate Limit:** 5/min

**Request:**
```json
{
  "email": "admin@neofilm.io",
  "password": "Password1"
}
```

**Response (200) - Without MFA:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "a1b2c3d4e5f6...",
  "expiresIn": 900,
  "tokenType": "Bearer",
  "user": {
    "id": "clx123...",
    "email": "admin@neofilm.io",
    "firstName": "Admin",
    "lastName": "User",
    "role": "SUPER_ADMIN"
  }
}
```

**Response (200) - With MFA:**
```json
{
  "mfaRequired": true,
  "mfaToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Errors:**
- `401` - Invalid credentials
- `403` - Account disabled / Account locked

---

### POST /auth/refresh
Rotate refresh token and get new access token.

**Auth:** Public (requires valid refresh token in body)

**Request:**
```json
{
  "refreshToken": "a1b2c3d4e5f6..."
}
```

**Response (200):** Same as login response.

**Errors:**
- `401` - Invalid/expired/reused refresh token

---

### POST /auth/logout
Revoke a specific refresh token.

**Auth:** Bearer JWT

**Request:**
```json
{
  "refreshToken": "a1b2c3d4e5f6..."
}
```

**Response (200):**
```json
{ "message": "Logged out successfully" }
```

---

### POST /auth/logout-all
Revoke all refresh tokens for the authenticated user.

**Auth:** Bearer JWT

**Response (200):**
```json
{ "message": "All sessions revoked" }
```

---

### GET /auth/me
Get current user profile.

**Auth:** Bearer JWT

**Response (200):**
```json
{
  "id": "clx123...",
  "email": "admin@neofilm.io",
  "firstName": "Admin",
  "lastName": "User",
  "role": "SUPER_ADMIN",
  "isActive": true,
  "mfaEnabled": true,
  "partnerId": null,
  "advertiserId": null,
  "lastLoginAt": "2026-02-25T10:00:00.000Z",
  "createdAt": "2026-02-25T09:00:00.000Z"
}
```

---

## MFA Endpoints

### POST /auth/mfa/setup
Generate TOTP secret and QR code.

**Auth:** Bearer JWT (SUPER_ADMIN, ADMIN only)

**Response (201):**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "otpauthUrl": "otpauth://totp/NeoFilm:admin@neofilm.io?secret=JBSWY3DPEHPK3PXP&issuer=NeoFilm",
  "qrCodeUrl": "https://api.qrserver.com/v1/create-qr-code/?..."
}
```

---

### POST /auth/mfa/enable
Confirm and enable MFA by providing a valid TOTP code.

**Auth:** Bearer JWT (SUPER_ADMIN, ADMIN only)

**Request:**
```json
{ "code": "123456" }
```

**Response (200):**
```json
{
  "message": "MFA enabled successfully",
  "backupCodes": ["A1B2C3D4", "E5F6G7H8", "..."]
}
```

---

### POST /auth/mfa/verify
Verify MFA code during login flow.

**Auth:** Public (requires mfaToken from login)

**Request:**
```json
{
  "mfaToken": "eyJhbGciOiJIUzI1NiIs...",
  "code": "123456"
}
```

**Response (200):** Same as login response (tokens + user).

---

### POST /auth/mfa/disable
Disable MFA (requires current TOTP code).

**Auth:** Bearer JWT (SUPER_ADMIN, ADMIN only)

**Request:**
```json
{ "code": "123456" }
```

**Response (200):**
```json
{ "message": "MFA disabled successfully" }
```

---

### POST /auth/mfa/backup-codes
Regenerate backup codes (requires current TOTP code).

**Auth:** Bearer JWT (SUPER_ADMIN, ADMIN only)

**Request:**
```json
{ "code": "123456" }
```

**Response (200):**
```json
{
  "backupCodes": ["A1B2C3D4", "E5F6G7H8", "..."]
}
```

---

## Device Auth Endpoints

### POST /auth/device
Authenticate a device using its provisioning token.

**Auth:** Public
**Rate Limit:** 10/min

**Request:**
```json
{
  "provisioningToken": "device-prov-token-xxx",
  "deviceFingerprint": "android-12-samsung-abc"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 86400,
  "tokenType": "Bearer",
  "device": {
    "id": "clx456...",
    "name": "Screen Salle 1",
    "venueId": "clx789..."
  }
}
```

---

### POST /auth/device/refresh
Refresh device access token.

**Auth:** Bearer JWT (device)

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 86400,
  "tokenType": "Bearer"
}
```

---

### POST /auth/device/heartbeat
Report device online status.

**Auth:** Bearer JWT (device)

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2026-02-25T10:00:00.000Z"
}
```

---

## Token Strategy

| Token Type | Format | TTL | Storage |
|---|---|---|---|
| Access Token | JWT (signed) | 15 min | Client only |
| Refresh Token | Random hex (128 chars) | 7 days | SHA-256 hash in DB |
| MFA Token | JWT (signed) | 5 min | Client only |
| Device Token | JWT (signed) | 24 hours | Client only |

### JWT Access Token Payload
```json
{
  "sub": "user-id",
  "email": "user@example.com",
  "role": "ADMIN",
  "partnerId": null,
  "advertiserId": null,
  "type": "access",
  "iat": 1740000000,
  "exp": 1740000900
}
```

### Refresh Token Security
- Stored as SHA-256 hash in `refresh_tokens` table
- **Rotation**: Each refresh issues a new token pair, old token is revoked
- **Reuse Detection**: If a revoked token is reused, ALL sessions for that user are revoked
- **Chain Tracking**: `replacedBy` field links old → new tokens

---

## Security Features

### Brute Force Protection
- 5 failed attempts → 15 min lockout
- 10 failed attempts → 1 hour lockout
- 20 failed attempts → 24 hour lockout
- Counter resets on successful login

### Rate Limiting
- Auth endpoints: 5 req/min (login)
- Device auth: 10 req/min
- General API: 100 req/min

### Audit Logging
All auth events are logged to the `audit_logs` table:
- `LOGIN_SUCCESS`, `LOGIN_FAILED`, `REGISTER`
- `LOGOUT`, `LOGOUT_ALL`, `TOKEN_REFRESH`
- `MFA_ENABLED`, `MFA_DISABLED`, `MFA_VERIFY_FAILED`
- `ACCOUNT_LOCKED`, `TOKEN_REUSE_DETECTED`
- `DEVICE_AUTH`

### Login Anomaly Detection
- New IP addresses are flagged
- User receives a notification when logging in from a new location
