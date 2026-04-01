import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DeviceGateway } from './device.gateway';
import { MqttService } from './mqtt.service';

class SendCommandDto {
  command!: string;
  params?: Record<string, any>;
}

@ApiTags('Device Gateway')
@ApiBearerAuth()
@Controller('device-gateway')
export class DeviceGatewayController {
  constructor(
    private readonly gateway: DeviceGateway,
    private readonly mqtt: MqttService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get gateway status (connected devices count)' })
  getStatus() {
    return {
      connectedDevices: this.gateway.getConnectedCount(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':deviceId/connected')
  @ApiOperation({ summary: 'Check if a device is connected via WebSocket' })
  isConnected(@Param('deviceId') deviceId: string) {
    return {
      deviceId,
      connected: this.gateway.isDeviceConnected(deviceId),
    };
  }

  @Post(':deviceId/command')
  @ApiOperation({ summary: 'Send a command to a device (via WebSocket + MQTT)' })
  async sendCommand(
    @Param('deviceId') deviceId: string,
    @Body() dto: SendCommandDto,
  ) {
    // Send via both channels for reliability
    this.gateway.sendCommandToDevice(deviceId, dto.command, dto.params);
    await this.mqtt.sendCommand(deviceId, dto.command, dto.params);

    return {
      sent: true,
      deviceId,
      command: dto.command,
    };
  }

  @Post(':deviceId/schedule')
  @ApiOperation({ summary: 'Push a schedule to a device' })
  async pushSchedule(
    @Param('deviceId') deviceId: string,
    @Body() schedule: Record<string, any>,
  ) {
    this.gateway.pushScheduleToDevice(deviceId, schedule);
    await this.mqtt.pushSchedule(deviceId, schedule);

    return { sent: true, deviceId };
  }
}
