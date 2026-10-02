import { test, expect, SEEDED } from '../fixtures';
import { ErrorSchema, LoginResponseSchema } from '../support/schemas';

test.describe('Authentication', () => {
  test('a registered user can log in and receives a token @smoke', async ({ anon }) => {
    const res = await anon.auth.login(SEEDED.member);

    expect(res.status()).toBe(200);
    await expect(res).toMatchSchema(LoginResponseSchema);
    expect((await res.json()).user).toMatchObject({ email: SEEDED.member.email, role: 'member' });
  });

  test('email matching is case-insensitive @regression', async ({ anon }) => {
    const res = await anon.auth.login({ ...SEEDED.member, email: SEEDED.member.email.toUpperCase() });
    expect(res.status()).toBe(200);
  });

  test('wrong password is rejected @regression', async ({ anon }) => {
    const res = await anon.auth.login({ ...SEEDED.member, password: 'wrong-password' });
    await expect(res).toFailWith(401, 'INVALID_CREDENTIALS');
  });

  test('unknown email and wrong password give identical responses, so accounts cannot be enumerated @security', async ({
    anon,
  }) => {
    const wrongPassword = await anon.auth.login({ ...SEEDED.member, password: 'wrong-password' });
    const unknownEmail = await anon.auth.login({ email: 'nobody@roomly.test', password: 'whatever' });

    expect(unknownEmail.status()).toBe(wrongPassword.status());
    expect(await unknownEmail.json()).toEqual(await wrongPassword.json());
  });

  const invalidBodies: Array<[string, Record<string, unknown>]> = [
    ['missing password', { email: SEEDED.member.email }],
    ['missing email', { password: 'x' }],
    ['malformed email', { email: 'not-an-email', password: 'x' }],
    ['empty password', { email: SEEDED.member.email, password: '' }],
    ['email as a number', { email: 12345, password: 'x' }],
  ];
  for (const [name, body] of invalidBodies) {
    test(`login body validation: ${name} → 400 @regression`, async ({ anon }) => {
      const res = await anon.auth.login(body);
      await expect(res).toFailWith(400, 'VALIDATION_ERROR');
      await expect(res).toMatchSchema(ErrorSchema);
    });
  }

  test.describe('protected endpoints', () => {
    test('reject requests without a token @security', async ({ anon }) => {
      await expect(await anon.rooms.list()).toFailWith(401, 'UNAUTHENTICATED');
      await expect(await anon.bookings.mine()).toFailWith(401, 'UNAUTHENTICATED');
    });

    test('reject an invalid token @security', async ({ anon }) => {
      const forged = anon.withToken('f'.repeat(48));
      await expect(await forged.rooms.list()).toFailWith(401, 'UNAUTHENTICATED');
    });

    test('reject a token sent with the wrong scheme @security', async ({ request }) => {
      const login = await request.post('/auth/login', { data: SEEDED.member });
      const { token } = await login.json();
      const res = await request.get('/rooms', { headers: { Authorization: `Token ${token}` } });
      await expect(res).toFailWith(401, 'UNAUTHENTICATED');
    });
  });
});
