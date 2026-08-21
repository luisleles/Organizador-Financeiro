import { describe, expect, it } from "vitest";
import { formatDate } from "@/lib/date";
import { parseOfx, parseOfxAmount, parseOfxDate } from "./ofx.parse";
import { OfxSource } from "./ofx.source";

const PARAMS = { accountId: "conta1", since: new Date("2000-01-01T00:00:00.000Z") };

const EXTRATO = `OFXHEADER:100
DATA:OFXSGML

<OFX>
 <BANKMSGSRSV1>
  <STMTTRNRS>
   <STMTRS>
    <BANKTRANLIST>
     <STMTTRN>
      <TRNTYPE>DEBIT
      <DTPOSTED>20260815120000[-3:BRT]
      <TRNAMT>-125.90
      <FITID>202608150001
      <MEMO>MERCADO DO BAIRRO
     </STMTTRN>
     <STMTTRN>
      <TRNTYPE>CREDIT
      <DTPOSTED>20260816
      <TRNAMT>7200.00
      <FITID>202608160002
      <NAME>SALARIO
     </STMTTRN>
    </BANKTRANLIST>
   </STMTRS>
  </STMTTRNRS>
 </BANKMSGSRSV1>
</OFX>`;

describe("parseOfxDate", () => {
  it("lê a data com fuso entre colchetes", () => {
    const data = parseOfxDate("20260815120000[-3:BRT]");
    expect(data && formatDate(data)).toBe("15/08/2026");
  });

  it("lê a data curta", () => {
    const data = parseOfxDate("20260815");
    expect(data && formatDate(data)).toBe("15/08/2026");
  });

  it("recusa lixo", () => {
    expect(parseOfxDate("")).toBeNull();
    expect(parseOfxDate("20261315")).toBeNull();
  });
});

describe("parseOfxAmount", () => {
  it.each([
    ["-125.90", -12590],
    ["7200.00", 720000],
    ["+15.5", 1550],
    ["10", 1000],
  ])("lê %s como %i centavos", (entrada, esperado) => {
    expect(parseOfxAmount(entrada)).toBe(esperado);
  });

  it("recusa valor que não é número", () => {
    expect(parseOfxAmount("abc")).toBeNull();
  });
});

describe("parseOfx", () => {
  it("lê cada bloco de transação", () => {
    const lidas = parseOfx(EXTRATO);

    expect(lidas).toHaveLength(2);
    expect(lidas[0].fitId).toBe("202608150001");
    expect(lidas[0].description).toBe("MERCADO DO BAIRRO");
    expect(lidas[0].amountCents).toBe(-12590);
    expect(lidas[0].type).toBe("DEBIT");
  });

  it("usa NAME quando não há MEMO", () => {
    expect(parseOfx(EXTRATO)[1].description).toBe("SALARIO");
  });

  it("ignora bloco sem data ou sem valor", () => {
    const quebrado = "<STMTTRN><FITID>1<MEMO>Sem data</STMTTRN>";
    expect(parseOfx(quebrado)).toEqual([]);
  });

  it("devolve vazio para arquivo que não é OFX", () => {
    expect(parseOfx("data;valor\n01/08;10,00")).toEqual([]);
  });
});

describe("OfxSource", () => {
  const source = new OfxSource({ text: EXTRATO });

  it("se identifica como fonte ofx", () => {
    expect(source.id).toBe("ofx");
  });

  it("usa o FITID como identidade", async () => {
    const lidas = await source.fetchTransactions(PARAMS);
    expect(lidas.map((row) => row.externalId)).toEqual(["202608150001", "202608160002"]);
  });

  it("guarda as tags originais no rawPayload", async () => {
    const [primeira] = await source.fetchTransactions(PARAMS);
    expect(primeira.rawPayload).toMatchObject({ TRNTYPE: "DEBIT", TRNAMT: "-125.90" });
  });

  it("calcula uma identidade estável quando falta FITID", async () => {
    const semFitId = new OfxSource({
      text: "<STMTTRN><DTPOSTED>20260815<TRNAMT>-10.00<MEMO>Padaria</STMTTRN>",
    });

    const primeira = await semFitId.fetchTransactions(PARAMS);
    const segunda = await semFitId.fetchTransactions(PARAMS);

    expect(primeira[0].externalId).not.toBe("");
    expect(primeira[0].externalId).toBe(segunda[0].externalId);
  });

  it("respeita o corte de data pedido", async () => {
    const lidas = await source.fetchTransactions({
      accountId: "conta1",
      since: new Date("2026-08-16T00:00:00.000Z"),
    });

    expect(lidas.map((row) => row.description)).toEqual(["SALARIO"]);
  });
});
