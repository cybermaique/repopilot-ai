import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

export class RegisterRepositoryDto {
  @ApiProperty({ enum: ['fixture'] }) @IsIn(['fixture']) kind!: 'fixture';
}
export class CreateRunDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') repositoryId!: string;
  @ApiProperty({ maxLength: 1000, minLength: 2 })
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  @Matches(/\S/)
  @IsNotEmpty()
  question!: string;
}
export class RepositoryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) workspaceId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['fixture'] }) kind!: string;
  @ApiProperty({ type: String, nullable: true }) activeSnapshotId!:
    string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}
export class SnapshotDto {
  @ApiProperty() id!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty() repositoryId!: string;
  @ApiProperty() revision!: string;
  @ApiProperty() fileCount!: number;
  @ApiProperty() chunkCount!: number;
  @ApiProperty({ type: [String] }) diagnostics!: string[];
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}
export class IndexRunStatusDto {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
}
export class RepositoryDetailDto extends RepositoryDto {
  @ApiProperty({ type: [SnapshotDto] }) snapshots!: SnapshotDto[];
  @ApiProperty({ type: IndexRunStatusDto, nullable: true })
  lastIndexRun!: IndexRunStatusDto | null;
}
export class SourceDto {
  @ApiProperty() sourceId!: string;
  @ApiProperty() snapshotId!: string;
  @ApiProperty() path!: string;
  @ApiProperty() revision!: string;
  @ApiProperty() startLine!: number;
  @ApiProperty() endLine!: number;
  @ApiProperty() content!: string;
}
export class FindingDto {
  @ApiProperty() text!: string;
  @ApiProperty({ type: [String] }) sourceIds!: string[];
}
export class AnswerDto {
  @ApiProperty({ enum: ['demo'] }) provider!: 'demo';
  @ApiProperty({ enum: ['supported', 'insufficient'] }) evidence!: string;
  @ApiProperty() summary!: string;
  @ApiProperty({ type: [FindingDto] }) findings!: FindingDto[];
  @ApiProperty({ type: [SourceDto] }) sources!: SourceDto[];
  @ApiProperty() durationMs!: number;
  @ApiProperty() limitation!: string;
}
export class IndexResultDto {
  @ApiProperty() snapshotId!: string;
  @ApiProperty() revision!: string;
  @ApiProperty() fileCount!: number;
  @ApiProperty() chunkCount!: number;
  @ApiProperty({ type: [String] }) diagnostics!: string[];
  @ApiProperty() reused!: boolean;
}
export class RunDto {
  @ApiProperty() id!: string;
  @ApiProperty() repositoryId!: string;
  @ApiProperty({ type: String, nullable: true }) snapshotId!: string | null;
  @ApiProperty({ type: String, nullable: true }) conversationId!: string | null;
  @ApiProperty({ enum: ['index', 'question'] }) kind!: string;
  @ApiProperty({ type: String, nullable: true }) question!: string | null;
  @ApiProperty({
    enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
  })
  status!: string;
  @ApiProperty() cancelRequested!: boolean;
  @ApiProperty({ type: AnswerDto, nullable: true }) answer!: AnswerDto | null;
  @ApiProperty({ type: IndexResultDto, nullable: true })
  indexResult!: IndexResultDto | null;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  finishedAt!: string | null;
}
export class EventDto {
  @ApiProperty() sequence!: number;
  @ApiProperty() type!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
export class HealthDto {
  @ApiProperty({ enum: ['ok'] }) status!: string;
  @ApiPropertyOptional() database?: string;
  @ApiPropertyOptional() provider?: string;
}
export class ErrorDto {
  @ApiProperty() statusCode!: number;
  @ApiProperty() message!: string;
}
