# SAP采购订单数据查询

本文档总结SAP ERP系统中查询采购订单（Purchase Order, PO）的SQL查询模式，涉及表**EKKO**、**EKPO**、**EKET**、**LFA1**、**EBAN**、**MARA**等。

## 核心表与关系

- **EKKO**: 采购订单抬头表。关键字段：`EBELN`（采购订单号）、`LIFNR`（供应商代码）、`BEDAT`（订单日期）。
- **EKPO**: 采购订单行项目表，通过 `EBELN` 与EKKO关联。字段：`EBELP`（行项目号）、`MATNR`（物料号）、`TXZ01`（物料描述短文本）、`MENGE`（数量）、`MEINS`（单位）、`NETPR`（净价）、`MWSKZ`（税率）、`PEINH`（价格单位）、`BANFN`（采购申请号）、`BNFPO`（采购申请行项目）。
- **EKET**: 采购订单交货计划表，通过 `EBELN`、`EBELP` 与EKPO关联。字段：`ETENR`（计划行号）、`J_3ASIZE`（尺码/颜色组合串）、`MENGE`（计划数量）、`J_3ANETP`（净价）。
- **LFA1**: 供应商主数据表，通过 `LIFNR` 与EKKO关联。字段：`NAME1`（供应商名称）。
- **EBAN**: 采购申请表，通过 `BANFN`、`BNFPO` 与EKPO关联。字段：`ERDAT`（创建日期）。
- **MARA**: 物料主数据通用表，通过 `MATNR` 关联。字段：`J_3APGNR`（分类组号）。
- **J_3APGHD**: 分类组抬头表，通过 `J_3APGNR` 与MARA关联。字段：`J_3ABZD1`（特性号）。
- **CAWN / CAWNT**: 用于根据特性值解析颜色名称。

## 查询示例

### 基本采购订单头与供应商查询
```sql
SELECT 
  EKKO.EBELN AS EBELN,
  LFA1.LIFNR AS LIFNR,
  LFA1.NAME1 AS NAME1
FROM 
  EKKO
INNER JOIN LFA1 ON EKKO.LIFNR = LFA1.LIFNR
WHERE 
  EKKO.EBELN = '3700166337';
```

### 采购订单行项目与交货计划（含颜色尺码解析）
```sql
SELECT 
  a.lifnr AS Lifnr,
  a.ebeln, 
  c.ebelp, 
  e.etenr, 
  c.matnr AS Lining, 
  c.txz01 AS Name, 
  e.j_3asize, 
  j.ATWTB AS ColorName, 
  SUBSTR(e.j_3asize, 1, 4) AS ColorCode, 
  c.MENGE AS Quantity, 
  c.meins, 
  c.Netpr AS UNITPRICENO, 
  c.Mwskz AS TaxRate,
  eb.BADAT AS BADAT
FROM 
  sapprd.ekko a 
INNER JOIN sapprd.lfa1 b ON b.lifnr = a.lifnr
INNER JOIN sapprd.ekpo c ON c.ebeln = a.ebeln
INNER JOIN sapprd.eket e ON e.ebeln = c.ebeln AND e.ebelp = c.ebelp
LEFT JOIN sapprd.EBAN eb ON c.BANFN = eb.BANFN AND c.BNFPO = eb.BNFPO
LEFT JOIN sapprd.MARA dd ON c.matnr = dd.matnr
LEFT JOIN sapprd.J_3APGHD f ON dd.j_3apgnr = f.j_3apgnr
LEFT JOIN sapprd.CAWN h ON f.j_3abzd1 = h.atinn AND h.atwrt = SUBSTR(e.j_3asize, 1, 4)
LEFT JOIN sapprd.CAWNT j ON f.j_3abzd1 = j.atinn AND h.atzhl = j.atzhl AND h.adzhl = j.adzhl AND j.SPRAS = '1'
WHERE 
  a.EBELN IN ('3100145641');
```

### 通过采购申请追溯采购订单
```sql
SELECT EKKO.EBELN AS EBELN, EKKO.BEDAT AS BEDAT, 
       EKPO.EBELP AS EBELP, EKPO.MATNR AS MATNR, 
       EBAN.BANFN AS BANFN, EBAN.ERDAT AS ERDAT, 
       EKKO.LIFNR AS LIFNR
FROM sapprd.EKKO
INNER JOIN sapprd.EKPO ON EKKO.EBELN = EKPO.EBELN
INNER JOIN sapprd.EBAN ON EKPO.BANFN = EBAN.BANFN AND EKPO.BNFPO = EBAN.BNFPO
WHERE EBAN.BANFN in ('7089981787') AND EBAN.ERDAT >= '20240101';
```

## 相关概念
- [[SAP销售订单数据查询]]
- [[SAP物料清单(BOM)展开查询]]
- [[SAP颜色尺码特性解析]]
- [[采购管理]]