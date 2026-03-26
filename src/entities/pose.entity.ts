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
  // keypoints may include optional `z` for 3D and `confidence`
  keypoints: Array<{ name: string; x: number; y: number; z?: number; confidence: number }>;

  @Column({ type: 'jsonb', nullable: true })
  editorState: {
    version: string;
    wholeTransform: {
      position: [number, number, number];
      quaternion: [number, number, number, number];
      scale: [number, number, number];
    };
    bones: Record<string, { quaternion: [number, number, number, number] }>;
  } | null;

  @Column({ type: 'float', nullable: true })
  detectedRatio: number | null;

  @Column({ type: 'boolean', default: false })
  isChosen: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Session, (session) => session.poses)
  session: Session;
}
