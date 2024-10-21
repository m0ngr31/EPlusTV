import type {FC} from 'hono/jsx';

export const Script: FC = () => {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          function updateCheckboxes() {
            document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
              const isEnabled = checkbox.getAttribute('data-enabled') === 'true';
              checkbox.checked = isEnabled;
            });
          }

          document.addEventListener('DOMContentLoaded', updateCheckboxes);
          // document.addEventListener('htmx:afterSwap', updateCheckboxes);
        `,
      }}
    />
  );
};
