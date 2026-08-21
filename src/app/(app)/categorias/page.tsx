import { PageHeader } from "@/components/shell/page-header";
import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { CategoryMark } from "@/components/categories/category-icon";
import { CategoryTree } from "@/components/categories/category-tree";
import { RulesManager } from "@/components/categories/rules-manager";
import { TagManager } from "@/components/categories/tag-manager";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  countUncategorized,
  listCategories,
  listCategoryRules,
} from "@/server/categories/category.service";
import { UnarchiveButton } from "@/components/categories/unarchive-button";
import { listTags } from "@/server/tags/tag.service";

/**
 * A árvore vem do banco e muda fora do build. Sem isto, o Next pré-renderiza a página uma
 * vez e serve categoria velha para sempre em produção.
 */
export const dynamic = "force-dynamic";

/**
 * A página lê o banco sem tocar em nenhuma API dinâmica, então o Next a prerenderizaria no
 * build e serviria dados congelados até alguma mutação revalidar. Num app local, o banco
 * muda por fora (seed, script, Prisma Studio) e a tela precisa refletir isso.
 */
export default async function CategoriasPage() {
  const [{ tree, archived, flat }, rules, tags, uncategorizedCount] = await Promise.all([
    listCategories(),
    listCategoryRules(),
    listTags(),
    countUncategorized(),
  ]);

  const parents = flat.filter((category) => !category.archived && category.parentId === null);
  const assignable = flat.filter((category) => !category.archived);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Categorias"
        description="Hierarquia de um nível: categorias e suas subcategorias. Arraste para reordenar ou use as setas de cada linha."
        action={<CategoryFormDialog parents={parents} label="Nova categoria" variant="primary" />}
      />

      <Card title="Árvore de categorias">
        <CategoryTree tree={tree} parents={parents} />
      </Card>

      {archived.length > 0 && (
        <Card title="Arquivadas">
          <ul className="flex flex-col gap-1">
            {archived.map((category) => (
              <li
                key={category.id}
                className="border-linha flex flex-wrap items-center gap-3 rounded-md border border-dashed px-3 py-2"
              >
                <CategoryMark color={category.color} icon={category.icon} size="sm" />
                <span className="text-texto-fraco text-sm">{category.name}</span>
                {category.parentId && <Badge tone="previsto">subcategoria</Badge>}
                <span className="valor text-num-xs text-texto-fraco">
                  {category.transactionCount} lançamentos
                </span>
                <div className="ml-auto">
                  <UnarchiveButton categoryId={category.id} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Regras de categorização">
        <RulesManager
          rules={rules}
          categories={assignable}
          uncategorizedCount={uncategorizedCount}
        />
      </Card>

      <Card title="Etiquetas">
        <TagManager tags={tags} />
      </Card>
    </div>
  );
}
