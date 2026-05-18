# SAP销售与采购关联查询

在服装行业，销售订单（SD）与采购订单（MM）通过需求传递（如采购申请）或直接关联表相互链接。本文档总结SAP中销售订单与采购订单之间关联查询的常用SQL模式，涉及表**VBAK/VBAP**、**EKKO/EKPO**、**EKKN**（科目分配）、**EBAN**等。

## 关联方式

1. **通过采购申请（EBAN）关联**：销售订单的行项目生成采购申请，采购申请再转为采购订单。`VBAP` 中的采购申请号 `BANFN` 字段可用于关联 `EBAN`。
2. **通过科目分配表EKKN关联**：采购订单行项目可以分配至销售订单。`EKKN` 表记录采购订单的科目分配对象，包括销售订单号 `VBELN` 和行项目 `VBELP`。

## 查询示例

### 通过EKKN关联获取采购订单对应的销售订单
```sql
SELECT DISTINCT
    a.ebeln, 
    c.ebelp,
    c.PEINH,
    e.etenr,
    pp.matnr,
    c.matnr AS Lining,
    c.txz01 AS Name,
    e.j_3asize,
    j.ATWTB AS ColorName,
    substr(e.j_3asize, 1, 4) AS ColorCode,
    e.Menge AS Quantity,
    c.meins,
    d.vbeln,
    d.vbelp,
    c.J_3agrdats AS Remark,
    e.J_3ANETP AS UNITPRICENO,
    c.Mwskz AS TaxRate
FROM sapprd.ekko a
INNER JOIN sapprd.lfa1 b ON b.lifnr = a.lifnr
INNER JOIN sapprd.ekpo c ON c.ebeln = a.ebeln
INNER JOIN sapprd.ekkn d ON d.ebeln = a.ebeln AND d.ebelp = c.ebelp
INNER JOIN sapprd.eket e ON e.ebeln = c.ebeln AND e.ebelp = c.ebelp
LEFT JOIN sapprd.MARA dd ON c.matnr = dd.matnr
LEFT JOIN sapprd.vbap pp ON pp.vbeln = d.vbeln AND pp.posnr = d.vbelp
LEFT JOIN sapprd.J_3APGHD f ON dd.j_3apgnr = f.j_3apgnr
LEFT JOIN sapprd.CAWN h ON f.j_3abzd1 = h.atinn AND h.atwrt = substr(e.j_3asize, 1, 4)
LEFT JOIN sapprd.CAWNT j ON f.j_3abzd1 = j.atinn AND h.atzhl = j.atzhl AND h.adzhl = j.adzhl AND j.SPRAS = '1'
WHERE a.EBELN in('3700167128')  AND LOEKZ=' ' AND c.LOEKZ!='L';
```

### 通过采购申请号关联
```sql
SELECT EKKO.EBELN, EKPO.MATNR, EBAN.BANFN, EBAN.ERDAT
FROM sapprd.EKKO
INNER JOIN sapprd.EKPO ON EKKO.EBELN = EKPO.EBELN
INNER JOIN sapprd.EBAN ON EKPO.BANFN = EBAN.BANFN AND EKPO.BNFPO = EBAN.BNFPO
WHERE EBAN.BANFN in ('7089981787');
```

## 关键表EKKN

- **EKKN**: 采购订单的科目分配表。字段：`EBELN`（采购订单号）、`EBELP`（行项目号）、`VBELN`（销售订单号）、`VBELP`（销售订单行项目号）。此表是连接采购和销售的直接桥梁。

## 相关概念
- [[SAP销售订单数据查询]]
- [[SAP采购订单数据查询]]
- [[SAP颜色尺码特性解析]]
- [[SAP物料清单(BOM)展开查询]]
- [[采购管理]]