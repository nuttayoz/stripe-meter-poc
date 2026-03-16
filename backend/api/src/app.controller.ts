import { Controller, Get, Headers } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth(@Headers() header: Headers) {
    console.log(header);
    return this.appService.getHealth();
  }

  @Get('version')
  getVersion() {
    return this.appService.getVersion();
  }
}
