import React from 'react';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TablePagination from '@material-ui/core/TablePagination';
import TableRow from '@material-ui/core/TableRow';
import TableSortLabel from '@material-ui/core/TableSortLabel';
import Checkbox from '@material-ui/core/Checkbox';
import {Box, IconButton, Table, TableContainer} from '@material-ui/core';
import {Candidate, CandidateId, MetaInformation, Structure} from '../model';
import {fixedPrec, JupyterContext} from '../util';
import {StructureGraphComponent} from './structure_graph';
import KeyboardArrowDownIcon from '@material-ui/icons/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@material-ui/icons/KeyboardArrowUp';
import Collapse from '@material-ui/core/Collapse';
import {DataSetDetailsComponent} from './dataset_details';
import {JupyterButton} from "../util/jupyter-button";

interface Data {
    id: CandidateId;
    timestamp: number;
    performance: number;
    candidate: [Structure, Candidate];
}

type Order = 'asc' | 'desc';

interface HeadCell {
    id: keyof Data;
    label: string;
    numeric: boolean;
    sortable: boolean;
    width: string;
}

interface CandidateTableHeadProps {
    headCells: HeadCell[]
    numSelected: number;
    onRequestSort: (event: React.MouseEvent<unknown>, property: keyof Data) => void;
    onSelectAllClick: (event: React.ChangeEvent<HTMLInputElement>) => void;
    order: Order;
    orderBy: string;
    rowCount: number;
}

class CandidateTableHead extends React.Component<CandidateTableHeadProps, {}> {

    constructor(props: CandidateTableHeadProps) {
        super(props);
    }

    render() {
        const {headCells, numSelected, onRequestSort, onSelectAllClick, order, orderBy, rowCount} = this.props

        return (
            <TableHead>
                <TableRow>
                    <TableCell padding='checkbox'>
                        <Checkbox
                            indeterminate={numSelected > 0 && numSelected < rowCount}
                            checked={rowCount > 0 && numSelected === rowCount}
                            onChange={onSelectAllClick}
                            color='primary'
                        />
                    </TableCell>
                    {headCells.map(headCell => (
                        <TableCell
                            key={headCell.id}
                            align={headCell.numeric ? 'right' : 'left'}
                            sortDirection={orderBy === headCell.id ? order : false}
                            style={{width: headCell.width}}
                        >
                            {headCell.sortable ?
                                <TableSortLabel
                                    active={orderBy === headCell.id}
                                    direction={orderBy === headCell.id ? order : 'asc'}
                                    onClick={(event: React.MouseEvent) => onRequestSort(event, headCell.id)}
                                >
                                    {headCell.label}
                                    {orderBy === headCell.id ? (
                                        <span className={'candidate-table_visually-hidden'}>
                                        {order === 'desc' ? 'sorted descending' : 'sorted ascending'}
                                    </span>
                                    ) : null}
                                </TableSortLabel>
                                : headCell.label}
                        </TableCell>
                    ))}
                    <TableCell style={{width: '175px'}}/>
                </TableRow>
            </TableHead>
        )
    }
}


interface CandidateTableRowProps {
    data: Data
    meta: MetaInformation
    selected: boolean
    onSelectionToggle: (id: CandidateId) => void
}

interface CandidateTableRowState {
    open: boolean
    selectedComponent: [string, string]
}

class CandidateTableRow extends React.Component<CandidateTableRowProps, CandidateTableRowState> {

    static contextType = JupyterContext;
    context: React.ContextType<typeof JupyterContext>;

    constructor(props: CandidateTableRowProps) {
        super(props);
        this.state = {open: false, selectedComponent: [undefined, undefined]}

        this.toggleOpen = this.toggleOpen.bind(this)
        this.openComponent = this.openComponent.bind(this)
        this.openCandidateInJupyter = this.openCandidateInJupyter.bind(this)
    }

    private toggleOpen(e: React.MouseEvent) {
        this.setState({
            open: !this.state.open,
            selectedComponent: [StructureGraphComponent.SOURCE, StructureGraphComponent.SOURCE]
        })
        e.stopPropagation()
    }

    private openComponent(component: [string, string]) {
        if (this.state.open && this.state.selectedComponent === component) {
            // Close details when selecting the same component again
            this.setState({open: false, selectedComponent: [undefined, undefined]})
        } else {
            this.setState({open: true, selectedComponent: component})
        }
    }

    private openCandidateInJupyter(e: React.MouseEvent) {
        this.context.createCell(`
from xautoml.util import io_utils

xautoml_X, xautoml_y, _ = io_utils.load_input_data('${this.props.meta.data_file}', framework='${this.props.meta.framework}')
xautoml_pipeline = io_utils.load_pipeline('${this.props.meta.model_dir}', '${this.props.data.id}', framework='${this.props.meta.framework}')
xautoml_pipeline
        `.trim())
        e.stopPropagation()
    }

    render() {
        const {data, meta, selected, onSelectionToggle} = this.props

        return (
            <>
                <TableRow
                    hover
                    onClick={() => onSelectionToggle(data.id)}
                    role='checkbox'
                    tabIndex={-1}
                    selected={selected}
                >
                    <TableCell padding='checkbox'>
                        <Checkbox
                            checked={selected}
                            color='primary'
                        />
                    </TableCell>
                    <TableCell component='th' id={data.id} scope='row' padding='none'>
                        {data.id}
                    </TableCell>
                    <TableCell align='right'>{data.timestamp}</TableCell>
                    <TableCell align='right'>{data.performance}</TableCell>
                    <TableCell align='right' style={{height: '50px'}} padding='none'>
                        <StructureGraphComponent structure={data.candidate[0]}
                                                 candidate={data.candidate[1]}
                                                 meta={meta}
                                                 onComponentSelection={this.openComponent}/>
                    </TableCell>
                    <TableCell>
                        <JupyterButton onClickHandler={this.openCandidateInJupyter}/>
                        <IconButton aria-label='expand row' size='small' onClick={this.toggleOpen}>
                            {this.state.open ? <KeyboardArrowUpIcon/> : <KeyboardArrowDownIcon/>}
                        </IconButton>
                    </TableCell>
                </TableRow>
                <TableRow>
                    <TableCell style={{padding: 0}} colSpan={6}>
                        <Collapse in={this.state.open} timeout='auto' unmountOnExit={false} mountOnEnter={false}>
                            <Box margin={1}>
                                <DataSetDetailsComponent
                                    candidate={data.candidate[1]}
                                    component={this.state.selectedComponent}
                                    meta={this.props.meta}
                                />
                            </Box>
                        </Collapse>
                    </TableCell>
                </TableRow>
            </>
        );
    }
}

interface CandidateTableProps {
    structures: Structure[];
    selectedCandidates: Set<CandidateId>;
    meta: MetaInformation;
    onCandidateSelection?: (cid: Set<CandidateId>) => void;
}

interface CandidateTableState {
    rows: Data[],
    order: Order
    orderBy: keyof Data
    page: number
    rowsPerPage: number
}

export class CandidateTable extends React.Component<CandidateTableProps, CandidateTableState> {

    static defaultProps = {
        onCandidateSelection: (_: CandidateId[]) => {
        }
    }

    constructor(props: CandidateTableProps) {
        super(props);

        this.state = {
            rows: this.calculateData(),
            order: 'desc',
            orderBy: 'performance',
            page: 0,
            rowsPerPage: 10
        }
        this.calculateData()

        this.handleRequestSort = this.handleRequestSort.bind(this)
        this.handleSelectAllClick = this.handleSelectAllClick.bind(this)
        this.handleSelectionToggle = this.handleSelectionToggle.bind(this)
        this.handleChangePage = this.handleChangePage.bind(this)
        this.handleChangeRowsPerPage = this.handleChangeRowsPerPage.bind(this)
    }

    private handleRequestSort(_: React.MouseEvent<unknown>, property: keyof Data): void {
        const isAsc = this.state.orderBy === property && this.state.order === 'asc';
        this.setState({order: isAsc ? 'desc' : 'asc', orderBy: property})
    }

    private handleSelectAllClick(event: React.ChangeEvent<HTMLInputElement>): void {
        if (event.target.checked) {
            const newSelected = this.state.rows.map((n) => n.id);
            this.props.onCandidateSelection(new Set(newSelected))
        } else {
            this.props.onCandidateSelection(new Set())
        }
    }

    private handleSelectionToggle(id: CandidateId): void {
        const selected = new Set(this.props.selectedCandidates)
        if (selected.has(id)) {
            selected.delete(id)
        } else {
            selected.add(id)
        }

        this.props.onCandidateSelection(selected)
    }

    private handleChangePage(_: unknown, newPage: number) {
        this.setState({page: newPage})
    }

    private handleChangeRowsPerPage(event: React.ChangeEvent<HTMLInputElement>) {
        this.setState({rowsPerPage: parseInt(event.target.value, 10), page: 0})
    }

    componentDidUpdate(prevProps: Readonly<CandidateTableProps>, prevState: Readonly<CandidateTableState>, snapshot?: any) {
        if (prevProps.structures !== this.props.structures) {
            const rows = this.calculateData()
            this.setState({rows: rows})
        }
    }

    private calculateData(): Data[] {
        const rows: Data[] = []

        const sign = this.props.meta.metric_sign
        this.props.structures.forEach(structure => {
            structure.configs.forEach(c => {
                rows.push(
                    {
                        id: c.id,
                        timestamp: fixedPrec(c.runtime.timestamp, 3),
                        performance: fixedPrec(sign * c.loss[0], 3),
                        candidate: [structure, c]
                    }
                )
            })
        })
        return rows
    }

    render() {
        const {rows, order, orderBy, page, rowsPerPage} = this.state
        const comp = (a: Data, b: Data) => {
            const sign = order === 'desc' ? 1 : -1
            if (b[orderBy] < a[orderBy])
                return sign * -1;
            if (b[orderBy] > a[orderBy])
                return sign * 1;
            return 0;
        }

        const headCells: HeadCell[] = [
            {id: 'id', numeric: false, sortable: true, label: 'Id', width: '40px'},
            {id: 'timestamp', numeric: true, sortable: true, label: 'Timestamp', width: '100px'},
            {id: 'performance', numeric: true, sortable: true, label: 'Performance', width: '110px'},
            {id: 'candidate', numeric: false, sortable: false, label: 'Configuration', width: 'auto'}
        ];

        return (
            <>
                <TableContainer>
                    <Table
                        aria-labelledby='tableTitle'
                        aria-label='enhanced table'
                        //TODO: To prevent the table from getting wider than parent, a fixed table-layout is necessary. Yet, this requires hardcoded columns width which is quite ugly (see HeadCell above).
                        //Replace everything with DataGrid once https://github.com/mui-org/material-ui-x/issues/192 is resolved.
                        style={{tableLayout: 'fixed'}}
                    >
                        <CandidateTableHead
                            headCells={headCells}
                            numSelected={this.props.selectedCandidates.size}
                            order={order}
                            orderBy={orderBy}
                            onSelectAllClick={this.handleSelectAllClick}
                            onRequestSort={this.handleRequestSort}
                            rowCount={rows.length}/>
                        <TableBody>
                            {rows.sort(comp)
                                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                                .map(row => {
                                    return (
                                        <CandidateTableRow key={row.id}
                                                           data={row}
                                                           meta={this.props.meta}
                                                           selected={this.props.selectedCandidates.has(row.id)}
                                                           onSelectionToggle={this.handleSelectionToggle}/>
                                    );
                                })}
                        </TableBody>
                    </Table>
                </TableContainer>
                <TablePagination
                    rowsPerPageOptions={[10, 20, 30]}
                    component='div'
                    count={rows.length}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={this.handleChangePage}
                    onRowsPerPageChange={this.handleChangeRowsPerPage}
                />
            </>
        )
    }
}
