import React from 'react';
import {
  BookOpen,
  GraduationCap,
  School,
  UserRound,
  LogIn,
  Bell,
  Users,
  Camera,
  MessageCircle,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const LORD_ICONS = {
  school: 'school',
  book: 'book',
  graduate: 'graduate',
  student: 'student',
  login: 'login',
  bell: 'bell',
  users: 'users',
  camera: 'camera',
  message: 'message',
  shield: 'shield',
} as const;

const ICONS: Record<string, LucideIcon> = {
  school: School,
  book: BookOpen,
  graduate: GraduationCap,
  student: UserRound,
  login: LogIn,
  bell: Bell,
  users: Users,
  camera: Camera,
  message: MessageCircle,
  shield: ShieldCheck,
};

interface LordIconProps {
  src: string;
  size?: number;
  trigger?: 'hover' | 'loop' | 'loop-on-hover' | 'click' | 'morph' | 'boomerang';
  className?: string;
  colors?: string;
}

export const LordIcon: React.FC<LordIconProps> = ({
  src,
  size = 48,
  className,
  colors = 'primary:#006937,secondary:#d4a373',
}) => {
  const Icon = ICONS[src] || BookOpen;
  const primaryColor = colors.match(/(?:^|,)primary:([^,]+)/)?.[1];

  return (
    <span className={cn('inline-flex items-center justify-center', className)} aria-hidden>
      <Icon size={size} color={primaryColor} />
    </span>
  );
};
