import React from "react";
import {DetailsModel} from "./model";
import {
    CancelablePromise,
    CanceledPromiseError,
    DecisionTreeNode,
    DecisionTreeResult,
    requestGlobalSurrogate
} from "../../handler";
import {LoadingIndicator} from "../loading";
import {GraphEdge, GraphNode, HierarchicalTree} from "../tree_structure";
import Slider from "rc-slider";
import {ErrorIndicator} from "../../util/error";
import {KeyValue} from "../../util/KeyValue";
import {Dag} from "d3-dag";


interface GlobalSurrogateProps {
    model: DetailsModel
}

interface GlobalSurrogateState {
    pendingRequest: CancelablePromise<DecisionTreeResult>
    data: DecisionTreeResult
    maxLeaves: number
    error: Error
}


export class GlobalSurrogateComponent extends React.Component<GlobalSurrogateProps, GlobalSurrogateState> {


    private static readonly NODE_HEIGHT = 45;
    private static readonly NODE_WIDTH = 100;

    private readonly ticks = [2, 3, 5, 7, 10, 15, 25, 50, 100]

    constructor(props: GlobalSurrogateProps) {
        super(props);
        this.state = {pendingRequest: undefined, data: undefined, maxLeaves: 10, error: undefined}

        this.onMaxLeavesChange = this.onMaxLeavesChange.bind(this)
    }

    componentDidMount() {
        this.queryDT()
    }

    componentDidUpdate(prevProps: Readonly<GlobalSurrogateProps>, prevState: Readonly<GlobalSurrogateState>, snapshot?: any) {
        if (prevProps.model.component !== this.props.model.component ||
            prevState.maxLeaves !== this.state.maxLeaves)
            this.queryDT()
    }

    private queryDT() {
        if (this.state.pendingRequest !== undefined) {
            // Request for data is currently still pending. Cancel previous request.
            this.state.pendingRequest.cancel()
        }

        const {candidate, meta, component} = this.props.model
        if (component === undefined)
            return

        const promise = requestGlobalSurrogate(candidate.id, meta.data_file, meta.model_dir, component, this.state.maxLeaves)
        this.setState({pendingRequest: promise, data: undefined, error: undefined})

        promise
            .then(data => {
                this.setState({data: data, pendingRequest: undefined})
            })
            .catch(error => {
                if (!(error instanceof CanceledPromiseError)) {
                    console.error(`Failed to fetch DecisionTreeResult data.\n${error.name}: ${error.message}`)
                    this.setState({error: error, pendingRequest: undefined})
                } else {
                    console.log('Cancelled promise due to user request')
                }
            });
    }

    private renderNodes(root: Dag<DecisionTreeNode>): JSX.Element {
        const renderedNodes = root.descendants().map(node =>
            <GraphNode key={node.data.label}
                       node={node}
                       nodeWidth={GlobalSurrogateComponent.NODE_WIDTH}
                       nodeHeight={GlobalSurrogateComponent.NODE_HEIGHT}>
                <p>{node.data.label}</p>
            </GraphNode>
        )
        const renderedEdges = root.links().map(link =>
            <GraphEdge key={link.source.data.label + '-' + link.target.data.label}
                       link={link}
                       nodeWidth={GlobalSurrogateComponent.NODE_WIDTH}
                       nodeHeight={GlobalSurrogateComponent.NODE_HEIGHT}/>
        )
        return (
            <>
                {renderedEdges}
                {renderedNodes}
            </>
        )
    }

    onMaxLeavesChange(idx: number) {
        this.setState({maxLeaves: this.ticks[idx]})
    }

    render() {
        const {data, pendingRequest, maxLeaves, error} = this.state

        const marks: any = {}
        this.ticks.forEach((v, idx) => marks[idx] = v)

        return (
            <>
                <ErrorIndicator error={error}/>
                {!error &&
                <>
                    <LoadingIndicator loading={!!pendingRequest}/>

                    {data?.root.children.length === 0 &&
                    <p>Decision Tree approximation not available for the actual predictions.</p>
                    }

                    {data?.root.children.length > 0 &&
                    <>
                        <div style={{display: 'flex'}}>
                            <div style={{flexGrow: 1}}>
                                <div
                                    style={{display: "flex", flexDirection: "column", justifyContent: "space-between"}}>
                                    <KeyValue key_={'Fidelity'} value={data.fidelity}/>
                                    <KeyValue key_={'Leave Nodes'} value={data.n_leaves}/>
                                </div>
                            </div>
                            <div style={{padding: '0 10px 1em', flexGrow: 2}}>
                                <span>Max. Leaf Nodes</span>
                                <Slider min={0} max={this.ticks.length - 1}
                                        defaultValue={this.ticks.indexOf(maxLeaves)}
                                        step={null} marks={marks}
                                        onAfterChange={this.onMaxLeavesChange}/>
                            </div>
                        </div>
                        <HierarchicalTree nodeHeight={GlobalSurrogateComponent.NODE_HEIGHT}
                                          nodeWidth={GlobalSurrogateComponent.NODE_WIDTH}
                                          data={data.root}
                                          render={this.renderNodes}/>
                    </>
                    }
                </>}
            </>
        )
    }

}
