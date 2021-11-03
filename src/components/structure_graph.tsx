import React from "react";
import {Candidate, Config, ConfigValue, MetaInformation, Pipeline, Structure} from "../model";
import {fixedPrec, normalizeComponent} from "../util";
import {Table, TableBody, TableCell, TableRow, Tooltip, Typography} from "@material-ui/core";
import {OutputDescriptionData, requestOutputDescription} from "../handler";
import {LoadingIndicator} from "./loading";
import {ErrorIndicator} from "../util/error";
import {GraphEdge, GraphNode, HierarchicalTree} from "./tree_structure";
import {Dag} from "d3-dag";


export class PipelineStep {
    public readonly children: PipelineStep[] = []

    constructor(public readonly id: string,
                public readonly label: string,
                public readonly config: Config) {
    }
}

interface SingleComponentProps {
    step: PipelineStep

    error: Error
    loading: boolean
    output: string

    onHover: () => void
}

class SingleComponent extends React.Component<SingleComponentProps, any> {

    render() {
        const {step, error, loading, output, onHover} = this.props

        const configTable: [[string, ConfigValue][], [string, ConfigValue][]] = [[], []]
        Array.from(step.config.entries())
            .forEach(([name, value], idx) => {
                configTable[idx % 2].push([name, value])
            })
        // Ensure that left and right array have exactly the same amount of elements
        if (configTable[0].length != configTable[1].length)
            configTable[1].push(["", ""])

        const configuration = <>
            <Typography color="inherit" component={'h4'}>Configuration</Typography>
            <Table>
                <TableBody>
                    {configTable[0]
                        .map(([name, value], idx) => {
                            const name2 = configTable[1][idx][0]
                            const value2 = configTable[1][idx][1]

                            return (
                                <TableRow key={name}>
                                    <TableCell component="th"
                                               scope="row">{name}</TableCell>
                                    <TableCell align="right">{
                                        typeof value === 'number' ? fixedPrec(value, 5) : String(value)
                                    }</TableCell>

                                    <TableCell component="th"
                                               scope="row">{name2}</TableCell>
                                    <TableCell align="right">{
                                        typeof value2 === 'number' ? fixedPrec(value2, 5) : String(value2)
                                    }</TableCell>
                                </TableRow>
                            )
                        })
                    }
                </TableBody>
            </Table>
        </>

        const tooltipContent = <>
            {step.config.size > 0 ?
                configuration :
                <Typography color="inherit" component={'h4'}>No Configuration</Typography>}
            <hr/>
            <Typography color="inherit" component={'h4'}>Output</Typography>

            <ErrorIndicator error={error}/>
            {!error &&
            <>
                <LoadingIndicator loading={loading}/>
                {!loading && (output ?
                    <div style={{overflowX: "auto", marginBottom: 0}}
                         dangerouslySetInnerHTML={{__html: output}}/> : <div>Missing</div>)
                }
            </>}
        </>

        return (
            <Tooltip placement={'top'}
                     classes={{tooltip: 'structure-graph_tooltip jp-RenderedHTMLCommon'}}
                     title={tooltipContent}
                     enterDelay={500}
                     enterNextDelay={500}
                     leaveDelay={500}
                     interactive={true}
                     onOpen={onHover}>
                {isPipEnd(step.id) ?
                    <p className={'structure-graph_end-node'}/> :
                    <p>{step.label}</p>
                }
            </Tooltip>
        )
    }
}

interface StructureGraphProps {
    structure: Structure
    candidate: Candidate
    meta: MetaInformation
    onComponentSelection?: (component: PipelineStep) => void
}

interface StructureGraphState {
    loading: boolean
    outputs: OutputDescriptionData
    error: Error
}

export class StructureGraphComponent extends React.Component<StructureGraphProps, StructureGraphState> {

    static readonly SOURCE = 'SOURCE'
    static readonly SINK = 'SINK'

    private static readonly NODE_HEIGHT = 20;
    private static readonly NODE_WIDTH = 100;

    constructor(props: StructureGraphProps) {
        super(props);
        this.state = {loading: false, outputs: new Map<string, string>(), error: undefined}

        this.fetchOutputs = this.fetchOutputs.bind(this)
        this.renderNodes = this.renderNodes.bind(this)
        this.onComponentSelection = this.onComponentSelection.bind(this)
    }

    fetchOutputs() {
        if (this.state.loading)
            // Loading already in progress
            return
        if (this.state.outputs.size > 0)
            // Outputs already cached
            return

        this.setState({loading: true})
        requestOutputDescription(this.props.candidate.id, this.props.meta.data_file, this.props.meta.model_dir)
            .then(data => this.setState({outputs: data, loading: false}))
            .catch(error => {
                console.error(`Failed to fetch output data.\n${error.name}: ${error.message}`);
                this.setState({error: error})
            });
    }

    // TODO wrong place, move to model.ts
    private toPipelineStep(candidate: Candidate, pipeline: Pipeline): PipelineStep {
        // TODO Pipeline currently only supports linear pipelines
        const root = new PipelineStep(StructureGraphComponent.SOURCE, 'Source', new Map<string, ConfigValue>())
        let prev = root
        pipeline.steps.forEach(([id, label]) => {
            const prefix = `${id}:`
            const subConfig = new Map<string, ConfigValue>()
            Array.from(candidate.config.keys())
                .filter(k => k.startsWith(prefix))
                .forEach(key => {
                    subConfig.set(key.substring(prefix.length), candidate.config.get(key))
                })

            const node = new PipelineStep(id, normalizeComponent(label), subConfig)
            prev.children.push(node)
            prev = node
        })

        prev.children.push(new PipelineStep(StructureGraphComponent.SINK, 'Sink', new Map<string, ConfigValue>()))
        return root
    }

    private onComponentSelection(step: PipelineStep, e: React.MouseEvent): void {
        const {onComponentSelection} = this.props
        if (!!onComponentSelection) {
            onComponentSelection(step)
            e.stopPropagation()
        }
    }

    private renderNodes(root: Dag<PipelineStep>): JSX.Element {
        const {outputs, loading, error} = this.state

        const renderedNodes = root.descendants().map(node => {
            return (
                <GraphNode key={node.data.label}
                           node={node}
                           isRoot={node.data.id === StructureGraphComponent.SOURCE}
                           isTerminal={node.data.id === StructureGraphComponent.SINK}
                           nodeWidth={StructureGraphComponent.NODE_WIDTH}
                           nodeHeight={StructureGraphComponent.NODE_HEIGHT}
                           onClickHandler={this.onComponentSelection}>
                    <SingleComponent step={node.data}
                                     error={error}
                                     loading={loading}
                                     output={outputs.get(node.data.id)}
                                     onHover={this.fetchOutputs}/>
                </GraphNode>
            )
        })

        const renderedEdges = root.links().map(link =>
            <GraphEdge key={link.source.data.label + '-' + link.target.data.label}
                       link={link}
                       nodeWidth={StructureGraphComponent.NODE_WIDTH}
                       nodeHeight={StructureGraphComponent.NODE_HEIGHT}/>
        )

        return (
            <>
                {renderedEdges}
                {renderedNodes}
            </>
        )
    }

    render() {
        const {structure, candidate} = this.props
        const data = this.toPipelineStep(candidate, structure.pipeline)

        return (
            <HierarchicalTree nodeHeight={StructureGraphComponent.NODE_HEIGHT}
                              nodeWidth={StructureGraphComponent.NODE_WIDTH}
                              data={data}
                              render={this.renderNodes}/>
        )
    }

}

function isPipEnd(id: string): boolean {
    return id === StructureGraphComponent.SOURCE || id === StructureGraphComponent.SINK
}
