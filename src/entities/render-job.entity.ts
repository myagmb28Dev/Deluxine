import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn, Index } from 'typeorm';
import { Session } from './session.entity';

@Entity('render_jobs')
export class RenderJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ type: 'varchar', length: 700, nullable: true })
  outputImageKey: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  outputImageUrl: string | null;

  @Index()
  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Session, (session) => session.renderJobs)
  session: Session;
}
