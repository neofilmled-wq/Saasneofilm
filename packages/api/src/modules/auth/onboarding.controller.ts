import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OnboardingService } from './onboarding.service';
import { CurrentUser } from '../../common/decorators';

@ApiTags('Onboarding')
@ApiBearerAuth()
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get onboarding status' })
  async getStatus(@CurrentUser() user: any) {
    return this.onboardingService.getOnboardingStatus(user.id);
  }

  @Post('complete')
  @ApiOperation({ summary: 'Complete onboarding' })
  async complete(@CurrentUser() user: any, @Body() body: any) {
    return this.onboardingService.completeOnboarding(user.id, body);
  }
}
