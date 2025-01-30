import type {FC} from 'hono/jsx';

export const Script: FC = () => (
  <script
    dangerouslySetInnerHTML={{
      __html: `
          function updateCheckboxes() {
            document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
              const isEnabled = checkbox.getAttribute('data-enabled') === 'true';
              checkbox.checked = isEnabled;
            });
          }

          function updateTextInputs() {
            document.querySelectorAll('input[type="text"], input[type="number"]').forEach(checkbox => {
              checkbox.value = checkbox.getAttribute('data-value');
            });
          }

          function refreshPage() {
            setTimeout(function() {
              location.reload();
            }, 5000);
          }

          document.addEventListener('DOMContentLoaded', updateCheckboxes);
          document.addEventListener('DOMContentLoaded', updateTextInputs);
          document.body.addEventListener("HXRefresh", refreshPage);
        `,
    }}
  />
);
