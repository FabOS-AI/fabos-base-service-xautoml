import React from "react";
import {DetailsModel} from "./model";
import {DecisionTreeNode, DecisionTreeResult} from "../../handler";
import {LoadingIndicator} from "../../util/loading";
import {GraphEdge, GraphNode, HierarchicalTree} from "../tree_structure";
import Slider from "rc-slider";
import {ErrorIndicator} from "../../util/error";
import {KeyValue} from "../../util/KeyValue";
import {Dag} from "d3-dag";
import {CommonWarnings} from "../../util/warning";
import {JupyterButton} from "../../util/jupyter-button";
import {JupyterContext} from "../../util";
import {ID} from "../../jupyter";


interface GlobalSurrogateProps {
    model: DetailsModel
}

interface GlobalSurrogateState {
    loading: boolean
    data: DecisionTreeResult
    maxLeafNodes: number
    error: Error
}


export class GlobalSurrogateComponent extends React.Component<GlobalSurrogateProps, GlobalSurrogateState> {

    static HELP = 'Approximates the pipeline using a global surrogate model. The surrogate model is a decision tree ' +
        'that is trained to approximate the predictions of a black-box model. By adjusting the maximum number of ' +
        'leaves in the decision tree, the fidelity of the approximation can be weighted against the simplicity of the ' +
        'explanation.'

    static contextType = JupyterContext;
    context: React.ContextType<typeof JupyterContext>;

    private static readonly NODE_HEIGHT = 56;
    private static readonly NODE_WIDTH = 100;

    private readonly ticks = [2, 3, 5, 7, 10, 15, 25, 50, 100]

    constructor(props: GlobalSurrogateProps) {
        super(props);
        this.state = {loading: true, data: undefined, maxLeafNodes: undefined, error: undefined}

        this.onMaxLeavesChange = this.onMaxLeavesChange.bind(this)
        this.exportTree = this.exportTree.bind(this)
        this.renderNodes = this.renderNodes.bind(this)
    }

    componentDidMount() {
        this.queryDT(this.state.maxLeafNodes)
    }

    componentDidUpdate(prevProps: Readonly<GlobalSurrogateProps>, prevState: Readonly<GlobalSurrogateState>, snapshot?: any) {
        if (prevProps.model.component !== this.props.model.component)
            this.queryDT(undefined)
    }

    private queryDT(maxLeafNodes: number) {
        const {candidate, component} = this.props.model
        if (component === undefined)
            return

        const promise = this.context.requestGlobalSurrogate(candidate.id, component, maxLeafNodes)
        this.setState({loading: true})

        promise
            .then(data => {
                this.setState({data: data, loading: false, maxLeafNodes: data.max_leaf_nodes})
            })
            .catch(error => {
                console.error(`Failed to fetch DecisionTreeResult data.\n${error.name}: ${error.message}`)
                this.setState({error: error, loading: false})
            });
    }

    private renderNodes(root: Dag<DecisionTreeNode>): JSX.Element {
        const {additional_features} = this.state.data

        const renderedNodes = root.descendants().map(node =>
            <GraphNode key={node.data.label}
                       node={node}
                       className={`global-surrogate_node ${
                           additional_features.filter(a => node.data.label.startsWith(a))
                               .length > 0 ? 'global-surrogate_additional-feature' : ''}`}
                       nodeWidth={GlobalSurrogateComponent.NODE_WIDTH}
                       nodeHeight={GlobalSurrogateComponent.NODE_HEIGHT}>
                <p title={node.data.label}>{node.data.label}</p>
            </GraphNode>
        )
        const renderedEdges = root.links().map(link =>
            <GraphEdge key={link.source.data.label + '-' + link.target.data.label}
                       link={link}
                       label={link.target.data.label === link.source.data.children[0].label}
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

    private onMaxLeavesChange(idx: number) {
        this.queryDT(this.ticks[idx])
    }

    private exportTree() {
        const {candidate, component} = this.props.model
        const {maxLeafNodes} = this.state

        this.context.createCell(`
from xautoml.util import pipeline_utils

${ID}_X, ${ID}_y, ${ID}_pipeline = xautoml.get_sub_pipeline('${candidate.id}', '${component}')

${ID}_dt = pipeline_utils.fit_decision_tree(${ID}_X, ${ID}_pipeline.predict(${ID}_X), max_leaf_nodes=${maxLeafNodes})
${ID}_dt
        `.trim())
    }

    render() {
        const {data, loading, error} = this.state

        const marks: any = {}
        this.ticks.forEach((v, idx) => marks[idx] = v)

        return (
            <>
                <ErrorIndicator error={error}/>
                {!error && <>
                    {data === undefined && <LoadingIndicator loading={true}/>}

                    {data?.root.children.length === 0 &&
                        <p>Decision Tree approximation not available for the actual predictions.</p>
                    }

                    {data?.root.children.length > 0 && <>
                        <div style={{display: 'flex'}}>
                            <div style={{flexGrow: 1}}>
                                <div style={{
                                    display: "flex", flexDirection: "column", justifyContent: "space-between"
                                }}>
                                    <KeyValue key_={'Fidelity'} value={data.fidelity}/>
                                    <KeyValue key_={'Leave Nodes'} value={data.n_leaves}/>
                                </div>
                            </div>
                            <div style={{padding: '0 10px 1em', flexGrow: 2}}>
                                <span>Max. Leaf Nodes</span>
                                <Slider min={0} max={this.ticks.length - 1}
                                        defaultValue={this.ticks.indexOf(data.max_leaf_nodes)}
                                        step={null} marks={marks}
                                        onAfterChange={this.onMaxLeavesChange}/>
                            </div>
                            <div style={{flexGrow: 1, alignSelf: "center"}}>
                                <JupyterButton style={{float: "right"}} onClick={this.exportTree}/>
                            </div>
                        </div>
                        {loading ? <LoadingIndicator loading={loading}/> :
                            <>
                                <CommonWarnings additionalFeatures={data.additional_features.length > 0}
                                                downsampled={data.downsampled}/>
                                <HierarchicalTree nodeHeight={GlobalSurrogateComponent.NODE_HEIGHT}
                                                  nodeWidth={GlobalSurrogateComponent.NODE_WIDTH}
                                                  data={data.root}
                                                  render={this.renderNodes}/>
                            </>
                        }
                    </>
                    }
                </>}
            </>
        )
    }

}
