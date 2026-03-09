import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  googleId: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  displayName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  picture: string | null;

  @Column({ type: 'text', nullable: true })
  accessToken: string | null;

  @Column({ type: 'text', nullable: true })
  refreshToken: string | null;

  @Column({ type: 'text', nullable: true })
  appRefreshTokenHash: string | null;

  @Column({ type: 'varchar', length: 50, default: 'Bearer' })
  tokenType: string;

  @Column({ type: 'text', nullable: true })
  scope: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  tokenUpdatedAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  rawProfile: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
