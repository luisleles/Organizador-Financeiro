"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import { moveCategoryAction } from "@/app/(app)/categorias/actions";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { CategorySummary, CategoryTree as Tree } from "@/server/categories/category.types";
import { ArchiveCategoryDialog } from "./archive-category-dialog";
import { CategoryFormDialog } from "./category-form-dialog";
import { CategoryMark } from "./category-icon";

type DropSlot = { parentId: string | null; index: number };
type MoveHandler = (categoryId: string, parentId: string | null, index: number) => void;

type CategoryTreeProps = {
  tree: Tree;
  parents: CategorySummary[];
};

/**
 * Arrastar é o caminho do mouse; as setas de cada linha são o mesmo comando pelo teclado.
 * Uma árvore que só reordena por arrasto é inacessível, então as duas formas chamam a
 * mesma Server Action.
 */
export function CategoryTree({ tree, parents }: CategoryTreeProps) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [hovered, setHovered] = useState<DropSlot | null>(null);
  const [pending, startTransition] = useTransition();
  const { notify } = useToast();
  const router = useRouter();

  const move: MoveHandler = (categoryId, parentId, index) => {
    startTransition(async () => {
      const result = await moveCategoryAction({
        categoryId,
        targetParentId: parentId,
        targetIndex: index,
      });

      if (result.status === "error") notify(result.message, "alerta");
      else router.refresh();
    });
  };

  function handleDrop(slot: DropSlot) {
    setHovered(null);
    const categoryId = dragging;
    setDragging(null);
    if (categoryId) move(categoryId, slot.parentId, slot.index);
  }

  const dropLineProps = (slot: DropSlot) => ({
    slot,
    dragging,
    active: hovered !== null && hovered.parentId === slot.parentId && hovered.index === slot.index,
    onHover: setHovered,
    onDrop: handleDrop,
  });

  const rowProps = {
    parents,
    tree,
    dragging,
    pending,
    onDragStart: setDragging,
    onDragEnd: () => {
      setDragging(null);
      setHovered(null);
    },
    onMove: move,
  };

  if (tree.length === 0) {
    return (
      <p className="text-texto-fraco text-sm">
        Nenhuma categoria ativa. Crie a primeira para começar a classificar seus lançamentos.
      </p>
    );
  }

  // As linhas de soltura são <li> irmãs dos itens: <li> direto dentro de <li> é HTML
  // inválido e derruba a hidratação da árvore inteira.
  return (
    <ul className="flex flex-col gap-1">
      <DropLine {...dropLineProps({ parentId: null, index: 0 })} />
      {tree.map((root, rootIndex) => (
        <Fragment key={root.id}>
          <li className="flex flex-col gap-1">
            <Row
              {...rowProps}
              node={root}
              siblings={tree}
              index={rootIndex}
              parentId={null}
              subcategories={root.children}
            />

            <ul className="border-linha ml-6 flex flex-col gap-1 border-l pl-4">
              <DropLine {...dropLineProps({ parentId: root.id, index: 0 })} />
              {root.children.map((child, childIndex) => (
                <Fragment key={child.id}>
                  <li>
                    <Row
                      {...rowProps}
                      node={child}
                      siblings={root.children}
                      index={childIndex}
                      parentId={root.id}
                      subcategories={[]}
                    />
                  </li>
                  <DropLine {...dropLineProps({ parentId: root.id, index: childIndex + 1 })} />
                </Fragment>
              ))}
            </ul>
          </li>
          <DropLine {...dropLineProps({ parentId: null, index: rootIndex + 1 })} />
        </Fragment>
      ))}
    </ul>
  );
}

type DropLineProps = {
  slot: DropSlot;
  dragging: string | null;
  active: boolean;
  onHover: (slot: DropSlot | null) => void;
  onDrop: (slot: DropSlot) => void;
};

function DropLine({ slot, dragging, active, onHover, onDrop }: DropLineProps) {
  return (
    <li
      aria-hidden
      onDragOver={(event) => {
        event.preventDefault();
        onHover(slot);
      }}
      onDragLeave={() => onHover(null)}
      onDrop={() => onDrop(slot)}
      className={cn(
        "-my-1 h-2 rounded-full transition",
        dragging !== null && "bg-linha/40",
        active && "bg-foco",
      )}
    />
  );
}

type RowProps = {
  node: CategorySummary;
  siblings: readonly CategorySummary[];
  index: number;
  parentId: string | null;
  subcategories: readonly CategorySummary[];
  tree: Tree;
  parents: CategorySummary[];
  dragging: string | null;
  pending: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onMove: MoveHandler;
};

function Row({
  node,
  siblings,
  index,
  parentId,
  subcategories,
  tree,
  parents,
  dragging,
  pending,
  onDragStart,
  onDragEnd,
  onMove,
}: RowProps) {
  const isRoot = parentId === null;
  const previousRoot = isRoot && index > 0 ? tree[index - 1] : null;
  const canIndent = Boolean(previousRoot) && subcategories.length === 0;
  const parentIndex = isRoot ? -1 : tree.findIndex((root) => root.id === parentId);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(node.id)}
      onDragEnd={onDragEnd}
      className={cn(
        "border-linha hover:bg-fundo flex items-center gap-3 rounded-md border px-3 py-2",
        dragging === node.id && "opacity-50",
        pending && "pointer-events-none",
      )}
    >
      <span aria-hidden className="text-texto-fraco cursor-grab select-none">
        ⠿
      </span>
      <CategoryMark color={node.color} icon={node.icon} size={isRoot ? "md" : "sm"} />

      <Link
        href={`/categorias/${node.id}`}
        className="text-texto text-sm font-medium hover:underline hover:underline-offset-4"
      >
        {node.name}
      </Link>

      {node.kind === "INCOME" && <Badge tone="entrada">receita</Badge>}
      {node.isSystem && <Badge tone="previsto">sistema</Badge>}
      <span className="valor text-num-xs text-texto-fraco">
        {node.transactionCount} {node.transactionCount === 1 ? "lançamento" : "lançamentos"}
      </span>

      <div className="ml-auto flex items-center gap-1">
        <MoveButton
          label="Mover para cima"
          symbol="↑"
          disabled={index === 0}
          onClick={() => onMove(node.id, parentId, index - 1)}
        />
        <MoveButton
          label="Mover para baixo"
          symbol="↓"
          disabled={index >= siblings.length - 1}
          onClick={() => onMove(node.id, parentId, index + 1)}
        />
        {isRoot ? (
          <MoveButton
            label="Tornar subcategoria da anterior"
            symbol="→"
            disabled={!canIndent}
            onClick={() =>
              previousRoot && onMove(node.id, previousRoot.id, previousRoot.children.length)
            }
          />
        ) : (
          <MoveButton
            label="Promover a categoria de primeiro nível"
            symbol="←"
            onClick={() => onMove(node.id, null, parentIndex + 1)}
          />
        )}

        {node.isSystem ? (
          <span className="text-texto-fraco text-xs">mantida pelo app</span>
        ) : (
          <>
            <CategoryFormDialog
              category={node}
              parents={parents}
              label="Editar"
              variant="ghost"
              size="sm"
            />
            <ArchiveCategoryDialog
              category={node}
              subcategories={subcategories}
              destinations={parents.filter(
                (parent) =>
                  parent.id !== node.id && !subcategories.some((child) => child.id === parent.id),
              )}
            />
          </>
        )}
      </div>
    </div>
  );
}

type MoveButtonProps = {
  label: string;
  symbol: string;
  disabled?: boolean;
  onClick: () => void;
};

function MoveButton({ label, symbol, disabled, onClick }: MoveButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="border-linha text-texto-fraco hover:border-linha-forte hover:text-texto flex size-7 items-center justify-center rounded-md border text-xs transition disabled:pointer-events-none disabled:opacity-35"
    >
      {symbol}
    </button>
  );
}
