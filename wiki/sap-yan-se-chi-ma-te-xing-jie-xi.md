# SAP颜色尺码特性解析

在SAP ERP中，服装行业的物料常通过特性（Characteristics）来管理颜色、尺码等属性。这些属性通常编码在采购订单的交货计划字段 `J_3ASIZE` 中，并通过分类系统（AUSP/CABN/CAWN/CAWNT）解析为可读的颜色名称和尺码值。本文档总结相关查询模式。

## 字段编码规则

- **J_3ASIZE**: 通常为7位或8位字符串。前4位为**颜色代码**（ColorCode），后3位或4位为**季节/尺码**信息。示例：`'0101S'` 表示颜色代码 `0101`，尺码 `S`。
- 颜色代码通过 `CAWN` 表（特性值）和 `CAWNT` 表（特性值文本）解析为颜色名称。
- 季节/尺码信息也可从 `J_3ASIZE` 中提取后4位判断。

## 解析流程

1. 从 `EKET.J_3ASIZE` 中提取前4位作为颜色代码 `ColorCode`。
2. 通过物料号关联 `MARA.J_3APGNR` 找到分类组号。
3. 通过 `J_3APGHD.J_3ABZD1` 找到特性内部编号（ATINN）。
4. 通过 `CAWN` 表匹配 `ATINN` 和 `ATWRT`（特性值），获取 `ATZHL` 和 `ADZHL`。
5. 通过 `CAWNT` 表匹配 `ATINN`、`ATZHL`、`ADZHL` 和语言 `SPRAS='1'` 获取颜色描述 `ATWTB`。

## 完整解析SQL示例

```sql
SELECT 
    i.PEINH, i.Matnr, i.Name, i.COLORCODE, 
    i.Quantity, i.UnitPriceNo, i.TaxRate, i.Season, 
    j.atwtb Colour, i.DeliveryTime
FROM (
    SELECT g.*, h.atzhl, h.adzhl 
    FROM (
        SELECT e.*, f.j_3abzd1 
        FROM (
            SELECT c.*, d.j_3apgnr 
            FROM (
                SELECT a.matnr, 
                       substr(b.j_3asize,1,4) ColorCode, 
                       CASE WHEN LENGTH(b.j_3asize) = 7 THEN substr(b.j_3asize, 5, 3) 
                            WHEN LENGTH(b.j_3asize) = 8 THEN substr(b.j_3asize, 5, 4) END as Season,
                       a.txz01 Name, 
                       b.Menge Quantity, 
                       a.PEINH PEINH, 
                       b.J_3ANETP UnitPriceNo, 
                       a.Mwskz TaxRate, 
                       J_3AEXFCP DeliveryTime 
                FROM sapprd.ekpo a 
                LEFT JOIN SAPPRD.eket b ON a.ebeln = b.ebeln and a.ebelp = b.ebelp 
                WHERE a.ebeln in ('3700166395')
            ) c 
            LEFT JOIN SAPPRD.MARA d ON c.matnr = d.matnr
        ) e
        LEFT JOIN SAPPRD.J_3APGHD f ON e.j_3apgnr = f.j_3apgnr
    ) g
    LEFT JOIN SAPPRD.CAWN h ON g.j_3abzd1 = h.atinn AND h.atwrt = g.ColorCode
) i 
LEFT JOIN SAPPRD.CAWNT j ON i.j_3abzd1 = j.atinn AND i.atzhl = j.atzhl AND i.adzhl = j.adzhl AND j.SPRAS = '1';
```

## 相关表说明

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| MARA | 物料主数据 | MATNR, J_3APGNR |
| J_3APGHD | 分类组抬头 | J_3APGNR, J_3ABZD1 (特性内部号) |
| CAWN | 特性值 | ATINN, ATWRT, ATZHL, ADZHL |
| CAWNT | 特性值文本 | ATINN, ATZHL, ADZHL, SPRAS, ATWTB |
| EKET | 采购订单交货计划 | EBELN, EBELP, ETENR, J_3ASIZE |

## 相关概念
- [[SAP采购订单数据查询]]
- [[SAP销售订单数据查询]]
- [[SAP物料清单(BOM)展开查询]]
- [[供应链文档]]