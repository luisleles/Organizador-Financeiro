import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Section, Specimen } from "./section";

export function ControlsSection() {
  return (
    <Section
      id="controles"
      title="Controles"
      note="Um único botão colorido em toda a aplicação: o destrutivo. O primário é tinta sobre papel, para que nenhuma cor compita com o dado."
    >
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Specimen label="Botão">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary">Lançar</Button>
              <Button variant="secondary">Duplicar</Button>
              <Button variant="ghost">Cancelar</Button>
              <Button variant="danger">Excluir</Button>
              <Button variant="primary" disabled>
                Salvando
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm">
                Lançar
              </Button>
              <Button variant="secondary" size="sm">
                Duplicar
              </Button>
            </div>
          </Specimen>

          <Specimen label="Badge">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="entrada">recebido</Badge>
              <Badge tone="saida">pago</Badge>
              <Badge tone="alerta">estourou</Badge>
              <Badge tone="previsto">previsto</Badge>
              <Badge tone="neutro">reembolsável</Badge>
            </div>
          </Specimen>
        </div>

        <div className="flex flex-col gap-4">
          <Field label="Descrição" htmlFor="sg-descricao" hint="Aparece na linha do extrato.">
            <Input id="sg-descricao" placeholder="Mercado Dia" defaultValue="Mercado Dia" />
          </Field>

          <Field label="Valor" htmlFor="sg-valor">
            <Input id="sg-valor" numeric prefix="R$" defaultValue="187,90" inputMode="decimal" />
          </Field>

          <Field label="Categoria" htmlFor="sg-categoria">
            <Select id="sg-categoria" defaultValue="alimentacao">
              <option value="alimentacao">Alimentação</option>
              <option value="transporte">Transporte</option>
              <option value="casa">Casa</option>
            </Select>
          </Field>

          <Field label="Conta" htmlFor="sg-conta" error="Selecione uma conta ativa.">
            <Select id="sg-conta" invalid defaultValue="">
              <option value="">—</option>
              <option value="itau">Itaú · corrente</option>
            </Select>
          </Field>

          <Field label="Observação" htmlFor="sg-obs">
            <Input id="sg-obs" placeholder="Desabilitado" disabled />
          </Field>
        </div>
      </div>
    </Section>
  );
}
