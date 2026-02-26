import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  getVersion() {
    return {
      name: 'api',
      version: process.env.npm_package_version ?? '0.0.1',
    };
  }
}
