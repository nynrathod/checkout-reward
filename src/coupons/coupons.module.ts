import { Module } from '@nestjs/common';
import { CouponsRepository } from './coupons.repository.js';

@Module({
  providers: [CouponsRepository],
  exports: [CouponsRepository],
})
export class CouponsModule {}
