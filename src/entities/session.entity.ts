import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Pose } from './pose.entity';
import { RenderJob } from './render-job.entity';

@Entity('sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  lineArtUrl: string;

  @Column({ type: 'jsonb', default: [] })
  history: Array<{ timestamp: string; action: string; payload?: Record<string, unknown> }>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Pose, (pose) => pose.session)
  poses: Pose[];

  @OneToMany(() => RenderJob, (job) => job.session)
  renderJobs: RenderJob[];
}
