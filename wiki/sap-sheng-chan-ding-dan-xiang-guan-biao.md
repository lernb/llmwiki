# 生产订单相关SAP表

本文档汇总了 `sap 解锁.txt` 脚本中涉及的主要 SAP 标准表及其在查询中的作用。这些表共同构成了生产订单工序查询的核心数据源。

## AUFK — 订单主数据

- **全称**：AUFTRAGSKOPF（订单表头）
- **用途**：存储订单的通用信息，如订单号 (`AUFNR`)、订单类型、创建日期等。
- 在脚本中用于关联 `KDAUF`（销售订单号）和 `ERDAT`（创建日期，注释掉的过滤条件）。

## AFKO — 生产订单表头

- **全称**：AUFTRAGSKOPF（生产订单）
- **用途**：存储生产订单的计划数据，如计划开始日期 (`GSTRP`)、订单号 (`AUFNR`)、订单计划 (`AUFPL`) 等。
- 脚本中主要用作主驱动表，通过 `a.aufpl = c.aufpl` 与工序表关联。

## AFPO — 生产订单项目

- **全称**：AUFTRAGSPOSITION（订单项目）
- **用途**：存储每个订单中的物料、数量、销售订单行项目等信息。
- 脚本中提供 `KDAUF`（销售订单号）、`KDPOS`（销售订单行项目）、`MATNR`（物料号）。

## AFVC — 生产订单工序

- **全称**：AUFTRAGSVORGANG（订单工序）
- **用途**：存储订单中的每道工序信息，包括工序号 (`VORNR`)、工序描述 (`LTXA1`)、工作中心、采购申请号 (`BANFN`) 等。
- 脚本中通过 `c.aufpl = a.aufpl` 关联，并获取 `vornr`, `ltxa1`, `banfn`。

## CRHD — 工作中心主数据

- **全称**：CRHD (Work Center Header)
- **用途**：定义工作中心（机器、产线、班组），包括工作中心代码 (`ARBPL`)、对象ID (`OBJID`) 等。
- 脚本中通过 `c.arbid = f.objid` 关联，获取 `f.arbpl` 用于后续分类。

## JEST — 对象状态表

- **全称**：JEST (Individual Object Status)
- **用途**：存储对象的系统状态（如 `I0013` 表示工序是否被删除/非激活）。
- 脚本中检查工序状态：`(select jt.INACT from sapprd.jest jt where c.OBJNR=jt.OBJNR and jt.STAT='I0013')` 为 `'X'` 或不存在，以排除非激活工序。

## MSEG / MKPF — 物料凭证

- **全称**：MSEG (Document Segment: Material)，MKPF (Document Header: Material)
- **用途**：记录物料移动凭证。脚本中被注释掉的子查询曾尝试通过物料凭证获取入库日期（`CPUDT`），但最终未使用。

## 相关视角（View）

### V_FACTORY_NB
- 内部视图，用于根据订单号和班组名获取车间名称（`CJNAME`）。

### V_FACTORY_MIS_WX
- 内部视图，用于根据订单号、班组名和采购申请号获取外发加工的车间名称。

## 相关概念

- [[SAP工序查询与分析]]
- [[CONFIRMLIST表]]
- [[TGROUP与TUSER表]]