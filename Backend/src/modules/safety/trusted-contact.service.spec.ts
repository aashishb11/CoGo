/* eslint-disable @typescript-eslint/unbound-method */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DbClient } from '@core/database/database.module';
import type { TrustedContact } from '@core/database/schema/trusted-contacts.schema';
import { TrustedContactRepository } from './trusted-contact.repository';
import { TrustedContactService } from './trusted-contact.service';

const tx = {} as DbClient;

const mkContact = (over: Partial<TrustedContact> = {}): TrustedContact => ({
  userId: 'u1',
  name: 'Marta',
  email: 'marta@example.com',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('TrustedContactService', () => {
  let repo: jest.Mocked<TrustedContactRepository>;
  let db: { transaction: jest.Mock };
  let svc: TrustedContactService;

  beforeEach(() => {
    repo = {
      findByUserId: jest.fn(),
      exists: jest.fn(),
      upsert: jest.fn(),
    } as unknown as jest.Mocked<TrustedContactRepository>;
    db = {
      transaction: jest.fn(async (fn: (tx: DbClient) => Promise<unknown>) =>
        fn({} as DbClient),
      ),
    };
    svc = new TrustedContactService(db as never, repo);
  });

  describe('upsertMine', () => {
    it('inserts a new contact when none exists', async () => {
      const created = mkContact({ name: 'Marta', email: 'marta@example.com' });
      repo.upsert.mockResolvedValueOnce(created);

      const result = await svc.upsertMine('u1', {
        name: 'Marta',
        email: 'marta@example.com',
      });

      expect(result).toEqual(created);
      expect(repo.upsert).toHaveBeenCalledWith(expect.anything(), {
        userId: 'u1',
        name: 'Marta',
        email: 'marta@example.com',
      });
    });

    it('overwrites the existing contact on a second call (never clears)', async () => {
      const updated = mkContact({ name: 'Other', email: 'other@example.com' });
      repo.upsert.mockResolvedValueOnce(updated);

      // The repo's upsert is `INSERT ... ON CONFLICT DO UPDATE` (see
      // trusted-contact.repository.ts); replaying the same userId always
      // overwrites name/email, never produces a delete or null row.
      const result = await svc.upsertMine('u1', {
        name: 'Other',
        email: 'other@example.com',
      });
      expect(result.name).toBe('Other');
      expect(result.email).toBe('other@example.com');
    });
  });

  describe('getMine', () => {
    it('returns the row when one exists', async () => {
      const existing = mkContact();
      repo.findByUserId.mockResolvedValueOnce(existing);

      await expect(svc.getMine('u1')).resolves.toEqual(existing);
    });

    it('throws 404 when no row exists', async () => {
      repo.findByUserId.mockResolvedValueOnce(null);
      await expect(svc.getMine('u1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('assertHasContact', () => {
    it('returns without throwing when the contact exists', async () => {
      repo.exists.mockResolvedValueOnce(true);
      await expect(svc.assertHasContact(tx, 'u1')).resolves.toBeUndefined();
      expect(repo.exists).toHaveBeenCalledWith(tx, 'u1');
    });

    it('throws TRUSTED_CONTACT_REQUIRED (403) when no contact is set', async () => {
      repo.exists.mockResolvedValueOnce(false);
      await expect(svc.assertHasContact(tx, 'u1')).rejects.toMatchObject({
        constructor: ForbiddenException,
        response: expect.objectContaining({
          code: 'TRUSTED_CONTACT_REQUIRED',
        }) as unknown,
      });
    });
  });
});
