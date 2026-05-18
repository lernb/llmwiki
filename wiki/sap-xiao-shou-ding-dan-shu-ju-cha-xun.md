# SAP销售订单数据查询

本文档总结了从SAP ERP系统中查询销售订单相关数据常用的SQL查询模式，涉及表**VBAK**（销售订单头）、**VBAP**（销售订单行项目）、**VBPA**（合作伙伴）、**KNA1**（客户主数据）、**MAKT**（物料描述）等。

## 核心表与关系

- **VBAK**: 销售订单抬头表，字段 `VBELN`（销售订单号）为主键。
- **VBAP**: 销售订单行项目表，与VBAK通过 `VBELN` 关联。关键字段：`MATNR`（物料号）、`KWMENG`（订单数量）、`CMPRE`（单价）、`KZWI1`（条件值）、`WAERK`（货币）。
- **VBPA**: 销售伙伴表，通过 `VBELN` 和 `PARVW`（伙伴功能）关联。`PARVW = 'AG'` 表示售达方。
- **KNA1**: 客户主数据表，通过 `KUNNR` 与VBPA关联。字段 `LAND1`（国家代码）。
- **T005T**: 国家文本表，通过 `LAND1` 和 `SPRAS` 语言关联，获取国家名称 `LANDX`。
- **MAKT**: 物料描述表，通过 `MATNR` 和 `SPRAS` 语言获取中文或英文描述。

## 查询示例

### 获取销售订单的物料信息
```sql
SELECT 
    VBAK.VBELN AS "销售订单号",
    VBAP.MATNR AS "物料号",
    MAKT.MAKTX AS "物料描述"
FROM 
    VBAK
INNER JOIN VBAP 
    ON VBAK.VBELN = VBAP.VBELN
LEFT JOIN MAKT 
    ON VBAP.MATNR = MAKT.MATNR 
    AND MAKT.SPRAS = 'ZH'  -- 取中文描述
WHERE 
    VBAK.VBELN = '2100019904';
```

### 获取销售订单的客户国家信息
```sql
SELECT 
    VBAK.VBELN AS VBELN, 
    KNA1.LAND1 AS LAND1, 
    T005T.LANDX AS LANDX
FROM 
    VBAK
JOIN VBPA ON VBAK.VBELN = VBPA.VBELN AND VBPA.PARVW = 'AG'
JOIN KNA1 ON VBPA.KUNNR = KNA1.KUNNR
LEFT JOIN T005T ON KNA1.LAND1 = T005T.LAND1 AND T005T.SPRAS = '1'
WHERE 
    VBAK.VBELN = '2100019904';
```

### 销售订单BOM展开（获取子件需求）
通过将销售订单行物料与BOM关联，可以计算子件需求数量。示例如下：
```sql
SELECT 
    VBAP.VBELN AS "销售订单号",
    STPO.IDNRK AS "子物料号",
    STPO.MENGE AS "需求数量"
FROM 
    VBAP
INNER JOIN MAST ON VBAP.MATNR = MAST.MATNR
INNER JOIN STPO ON MAST.STLNR = STPO.STLNR
WHERE 
    VBAP.VBELN = '2100010054'
    AND STPO.LKENZ = '';  -- 过滤有效BOM项
```

## 相关概念
- [[SAP物料清单(BOM)展开查询]]
- [[SAP采购订单数据查询]]
- [[SAP颜色尺码特性解析]]
- [[采购管理]]