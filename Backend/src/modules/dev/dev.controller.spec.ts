// `@thallesp/nestjs-better-auth` ships as ESM and is not transformed by the
// repo's ts-jest config; importing the controller would fail under Jest's CJS
// loader. Stub the module before the import. Mirrors chat.gateway.spec.ts.
jest.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => () => undefined,
}));

import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DB } from '@core/database/database.module';
import { NotificationsService } from '@modules/notifications/notifications.service';
import { DevController } from './dev.controller';

describe('DevController', () => {
  let controller: DevController;
  const originalDemoMode = process.env.DEMO_MODE;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [DevController],
      providers: [
        { provide: DB, useValue: {} },
        {
          provide: NotificationsService,
          useValue: { sendTrafficAlert: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(DevController);
  });

  afterEach(() => {
    if (originalDemoMode === undefined) {
      delete process.env.DEMO_MODE;
    } else {
      process.env.DEMO_MODE = originalDemoMode;
    }
  });

  it('throws ForbiddenException when DEMO_MODE is not "true"', async () => {
    delete process.env.DEMO_MODE;
    await expect(controller.trafficAlert({})).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    process.env.DEMO_MODE = 'false';
    await expect(controller.trafficAlert({})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
