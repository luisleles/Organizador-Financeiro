"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { Section, Specimen } from "./section";

export function OverlaysSection() {
  const [open, setOpen] = useState(false);
  const { notify } = useToast();

  return (
    <Section
      id="sobreposicoes"
      title="Sobreposições"
      note="Modal usa <dialog> nativo, com Esc e foco preso pelo navegador. Toast fica preso à borda inferior no celular e ao canto direito no desktop, sempre acima da barra de navegação."
    >
      <div className="flex flex-wrap gap-8">
        <Specimen label="Modal">
          <Button onClick={() => setOpen(true)}>Excluir conta</Button>
        </Specimen>

        <Specimen label="Toast">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => notify("Lançamento salvo.")}>
              neutro
            </Button>
            <Button size="sm" onClick={() => notify("R$ 2.400,00 recebido em Itaú.", "entrada")}>
              entrada
            </Button>
            <Button size="sm" onClick={() => notify("Lazer estourou o orçamento.", "alerta")}>
              alerta
            </Button>
          </div>
        </Specimen>
      </div>

      <Modal
        open={open}
        title="Excluir Nubank · cartão"
        description="Os 412 lançamentos dessa conta serão apagados junto. Arquivar preserva o histórico."
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Arquivar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setOpen(false);
                notify("Conta excluída.", "alerta");
              }}
            >
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-texto-fraco">
          Digite <span className="valor text-texto">Nubank</span> para confirmar em uma tela real.
          Aqui a confirmação está simplificada.
        </p>
      </Modal>
    </Section>
  );
}
