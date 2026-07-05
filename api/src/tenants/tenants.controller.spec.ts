import { Test } from '@nestjs/testing';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

describe('TenantsController', () => {
  let controller: TenantsController;
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [TenantsController],
      providers: [{ provide: TenantsService, useValue: service }],
    }).compile();
    controller = moduleRef.get(TenantsController);
  });

  it('delegates creation to the service', async () => {
    service.create.mockResolvedValue({ id: 't1', slug: 'acme', name: 'Acme', schemaName: 'tenant_acme', status: 'active' });
    const result = await controller.create({ slug: 'acme', name: 'Acme' });
    expect(service.create).toHaveBeenCalledWith({ slug: 'acme', name: 'Acme' });
    expect(result.slug).toBe('acme');
  });

  it('delegates listing to the service', async () => {
    service.findAll.mockResolvedValue([]);
    await controller.findAll();
    expect(service.findAll).toHaveBeenCalled();
  });

  it('delegates update to the service', async () => {
    service.update.mockResolvedValue({ id: 't1', status: 'suspended' });
    await controller.update('t1', { status: 'suspended' });
    expect(service.update).toHaveBeenCalledWith('t1', { status: 'suspended' });
  });
});
