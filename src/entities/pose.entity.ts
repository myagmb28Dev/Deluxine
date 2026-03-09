import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn, Index } from 'typeorm';
import { Session } from './session.entity';

@Entity('poses')
export class Pose {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'varchar', length: 200 })
  label: string;

  @Column({ type: 'jsonb' })
  keypoints: Array<{ name: string; x: number; y: number; confidence: number }>;

  @Column({ type: 'boolean', default: false })
  isChosen: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Session, (session) => session.poses)
  session: Session;
}
