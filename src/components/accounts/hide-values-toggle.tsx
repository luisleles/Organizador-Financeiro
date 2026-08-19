import { Button } from "@/components/ui/button";
import { toggleValuesHiddenAction } from "@/app/(app)/contas/actions";

type HideValuesToggleProps = {
  hidden: boolean;
};

/** Formulário puro, sem JavaScript: a preferência é um cookie escrito por Server Action. */
export function HideValuesToggle({ hidden }: HideValuesToggleProps) {
  return (
    <form action={toggleValuesHiddenAction}>
      <input type="hidden" name="hidden" value={hidden ? "0" : "1"} />
      <Button type="submit" variant="ghost" size="sm">
        {hidden ? "Mostrar valores" : "Esconder valores"}
      </Button>
    </form>
  );
}
