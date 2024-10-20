import type {FC, ReactNode} from 'hono/jsx';

export interface IMainProps {
  children: ReactNode;
}
export const Main: FC = ({children}: IMainProps) => <main class="container">{children}</main>;
