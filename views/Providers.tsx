import type {FC, ReactNode} from 'hono/jsx';

export interface IProvidersProps {
  children: ReactNode;
}

export const Providers: FC = ({children}: IProvidersProps) => (
  <section>
    <h3>Providers</h3>
    {children}
  </section>
);
