import { beforeAll, describe, expect, it } from "vitest";
import { generateKeyPair, SignJWT, type JWTPayload } from "jose";

let keys: Awaited<ReturnType<typeof generateKeyPair>>;
const projectId = "semancontrol-test";
const now = Math.floor(Date.now() / 1000);

beforeAll(async () => {
  keys = await generateKeyPair("RS256");
});

async function token(overrides: JWTPayload = {}, key = keys.privateKey, alg = "RS256") {
  return new SignJWT({
    sub: "google-uid", aud: projectId, iss: `https://securetoken.google.com/${projectId}`,
    iat: now - 2, exp: now + 300, auth_time: now - 10,
    email: "Client@example.com", email_verified: true, name: "Cliente",
    firebase: { sign_in_provider: "google.com" }, ...overrides,
  }).setProtectedHeader({ alg, kid: "test-key" }).sign(key);
}

describe("Firebase Google identity verification", () => {
  it("accepts a signed Google token and returns identity without claimed roles", async () => {
    const { createFirebaseTokenVerifier } = await import("../src/lib/auth/verify-token");
    const verify = createFirebaseTokenVerifier(async () => keys.publicKey);
    expect(await verify(await token({ role: "ADMIN" }), projectId)).toEqual({
      uid: "google-uid", email: "client@example.com", name: "Cliente",
      expiresAt: now + 300, issuedAt: now - 2, authTime: now - 10,
    });
  });

  it("denies a token signed with a different RSA private key", async () => {
    const { createFirebaseTokenVerifier } = await import("../src/lib/auth/verify-token");
    const other = await generateKeyPair("RS256");
    const verify = createFirebaseTokenVerifier(async () => keys.publicKey);
    await expect(verify(await token({}, other.privateKey), projectId)).rejects.toMatchObject({ status: 401 });
  });

  it.each([
    ["expired", { exp: now - 1 }],
    ["wrong audience", { aud: "another-project" }],
    ["array audience", { aud: [projectId, "another-project"] }],
    ["wrong issuer", { iss: "https://securetoken.google.com/another-project" }],
    ["future issue", { iat: now + 120 }],
    ["future authentication", { auth_time: now + 120 }],
    ["empty uid", { sub: "" }],
    ["long uid", { sub: "x".repeat(129) }],
    ["unverified email", { email_verified: false }],
    ["missing email", { email: undefined }],
    ["invalid email", { email: "invalid" }],
    ["non Google provider", { firebase: { sign_in_provider: "password" } }],
    ["missing expiry", { exp: undefined }],
    ["missing issued time", { iat: undefined }],
    ["missing authentication time", { auth_time: undefined }],
  ])("denies %s", async (_name, claims) => {
    const { createFirebaseTokenVerifier } = await import("../src/lib/auth/verify-token");
    const verify = createFirebaseTokenVerifier(async () => keys.publicKey);
    await expect(verify(await token(claims), projectId)).rejects.toMatchObject({ status: 401 });
  });

  it("denies an HS256 token even if its claims are valid", async () => {
    const { createFirebaseTokenVerifier } = await import("../src/lib/auth/verify-token");
    const jwt = await new SignJWT({ sub: "google-uid", aud: projectId })
      .setProtectedHeader({ alg: "HS256", kid: "test-key" }).sign(new Uint8Array(32));
    await expect(createFirebaseTokenVerifier(async () => keys.publicKey)(jwt, projectId))
      .rejects.toMatchObject({ status: 401 });
  });
});
