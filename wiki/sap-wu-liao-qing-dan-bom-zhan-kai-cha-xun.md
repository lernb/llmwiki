# SAP物料清单(BOM)展开查询

物料清单（Bill of Material, BOM）是SAP中描述产品组成结构的关键数据。本文档总结从SAP ERP中查询BOM信息的常用SQL模式，涉及表**MAST**、**STKO**、**STPO**，以及物料主数据**MARA**、**MAKT**和分类特性表。

## 核心表与关系

- **MAST**: BOM物料分配表，将物料与BOM号关联。关键字段：`MATNR`（物料号）、`STLNR`（BOM号）、`WERKS`（工厂）、`STLAN`（BOM用途）。
- **STKO**: BOM抬头表，通过 `STLNR` 和 `STLTY` 关联。`STLNR` 是BOM编号，`STLTY` 是BOM类型（如 'M' 表示物料BOM）。
- **STPO**: BOM项目表（组件表），通过 `STLTY`、`STLNR` 与STKO关联。关键字段：`IDNRK`（组件物料号）、`MENGE`（组件数量）、`MEINS`（单位）、`STUFE`（层级）、`DATUV`/`DATUB`（有效期）、`LKENZ`（删除标记）。
- **AUSP/CABN/CAWN/CAWNT**: 用于获取特性值（如尺码、颜色），通过 `OBJEK`（物料号）关联。

## 查询模式

### 基本BOM展开（单层）
```sql
SELECT 
    mast.MATNR AS 主物料号,
    stpo.IDNRK AS 组件物料号,
    stpo.MENGE AS 数量,
    stpo.MEINS AS 单位,
    stpo.STLKN AS 节点号
FROM 
    SAPPRD.mast
JOIN SAPPRD.stko ON mast.stlnr = stko.stlnr
JOIN SAPPRD.stpo ON stko.stlty = stpo.stlty AND stko.stlnr = stpo.stlnr
WHERE 
    mast.MATNR = '25Q3BD23692KD552'
    AND stpo.DATUV <= CURRENT_DATE
    AND stpo.DATUB >= CURRENT_DATE
    AND stpo.LKENZ = '';
```

### 带物料描述的BOM展开
```sql
SELECT 
    mast.MATNR, 
    stpo.IDNRK, 
    stpo.MENGE, 
    stpo.MEINS, 
    makt.MAKTX
FROM 
    SAPPRD.mast
INNER JOIN SAPPRD.stko ON mast.stlnr = stko.stlnr
INNER JOIN SAPPRD.stpo ON stko.stlty = stpo.stlty AND stko.stlnr = stpo.stlnr
LEFT JOIN SAPPRD.makt ON makt.matnr = stpo.IDNRK
WHERE 
    stpo.IDNRK LIKE '%109093' 
    AND mast.MATNR = '25Q3BD28236J5126';
```

### 多工厂与BOM用途过滤
```sql
SELECT *
FROM sapprd.mast
JOIN sapprd.stpo ON mast.stlnr = stpo.stlnr
    AND mast.werks = '2000'        -- 工厂代码
    AND mast.stlan = '1'           -- BOM用途（1=生产BOM）
LEFT JOIN sapprd.ausp ON stpo.idnrk = ausp.objek
LEFT JOIN sapprd.cabn ON ausp.atinn = cabn.atinn
LEFT JOIN sapprd.cawnt ON cabn.atinn = cawnt.atinn
WHERE 
    mast.matnr = '352AE8015100000'
    AND stpo.datuv <= SYSDATE
    AND stpo.datub >= SYSDATE;
```

## 相关概念
- [[SAP销售订单数据查询]]
- [[SAP采购订单数据查询]]
- [[SAP颜色尺码特性解析]]
- [[供应链文档]]